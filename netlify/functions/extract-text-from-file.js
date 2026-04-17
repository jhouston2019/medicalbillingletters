/**
 * TEXT EXTRACTION ENGINE
 * 
 * Extracts text from PDF and image files
 * - PDF: Uses pdf-parse
 * - Images: Uses Tesseract.js OCR
 * 
 * NO PLACEHOLDERS - PRODUCTION READY
 */

const { PDFParse } = require('pdf-parse');
const Tesseract = require('tesseract.js');
const { getSupabaseAdmin } = require('./_supabase');
const { verifyOwnership } = require('./_helpers/ownership-verifier');
const { validateFileSize, validateMimeType, validateTextLength, MAX_PDF_PAGES } = require('./_helpers/file-validator');

// LIMITS TO PREVENT ABUSE
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
// MAX_PDF_PAGES is imported from file-validator
const OCR_TIMEOUT = 8000; // 8 seconds (Netlify has 10s limit)
const MIN_TEXT_LENGTH = 50; // Minimum extracted text

/**
 * Timeout wrapper for async operations
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} - Wrapped promise with timeout
 */
function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { filePath, fileType, documentId, userId } = JSON.parse(event.body || '{}');
    
    if (!filePath) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'File path is required' })
      };
    }

    // OWNERSHIP VERIFICATION: Verify user owns this document
    if (documentId && userId) {
      const ownership = await verifyOwnership(documentId, userId);
      if (!ownership.verified) {
        return {
          statusCode: ownership.statusCode || 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            error: 'Access denied',
            message: ownership.error
          })
        };
      }
    }

    console.log('Extracting text from:', filePath, 'Type:', fileType);

    // Download file from Supabase Storage
    const supabase = getSupabaseAdmin();
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('claim-letters')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    // SERVER-SIDE FILE SIZE VALIDATION
    const fileSize = fileData.size;
    console.log('File size:', fileSize, 'bytes');
    
    const sizeValidation = validateFileSize(fileSize);
    if (!sizeValidation.valid) {
      throw new Error(sizeValidation.error);
    }

    // SERVER-SIDE MIME TYPE VALIDATION
    const mimeValidation = validateMimeType(fileType, filePath);
    if (!mimeValidation.valid) {
      throw new Error(mimeValidation.error);
    }

    let extractedText = '';

    // Extract based on file type
    if (fileType === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf')) {
      // PDF extraction with page limit (pdf-parse v2: PDFParse + getText)
      console.log('Extracting from PDF...');
      const buffer = await fileData.arrayBuffer();
      const pdfBuffer = Buffer.from(buffer);

      const pdfData = await withTimeout(
        (async () => {
          const parser = new PDFParse({ data: pdfBuffer });
          return parser.getText();
        })(),
        OCR_TIMEOUT
      );

      extractedText = (pdfData && pdfData.text) || '';
      if (pdfData && Array.isArray(pdfData.pages) && pdfData.pages.length > MAX_PDF_PAGES) {
        extractedText = pdfData.pages
          .slice(0, MAX_PDF_PAGES)
          .map((p) => (p && p.text) || '')
          .join('\n');
      }

      const numPages =
        typeof pdfData.total === 'number'
          ? pdfData.total
          : Array.isArray(pdfData.pages)
            ? pdfData.pages.length
            : 0;
      console.log(
        `PDF: ${numPages} pages, processed first ${Math.min(numPages, MAX_PDF_PAGES)} pages`
      );
      
    } else if (fileType?.startsWith('image/') || /\.(jpg|jpeg|png)$/i.test(filePath)) {
      // Image OCR extraction with timeout
      console.log('Extracting from image using OCR...');
      const buffer = await fileData.arrayBuffer();
      
      try {
        const result = await withTimeout(
          Tesseract.recognize(
            Buffer.from(buffer),
            'eng',
            {
              logger: m => {
                if (m.status === 'recognizing text') {
                  console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
                }
              }
            }
          ),
          OCR_TIMEOUT
        );
        extractedText = result.data.text;
        console.log('OCR completed successfully');
        
      } catch (ocrError) {
        if (ocrError.message.includes('timed out')) {
          throw new Error('OCR processing timed out. The image may be too large or complex. Please try a smaller image or PDF instead.');
        }
        throw ocrError;
      }
      
    } else {
      throw new Error('Unsupported file type. Only PDF and images (JPG, PNG) are supported.');
    }

    // Validate extracted text
    const trimmedText = extractedText.trim();
    
    const textValidation = validateTextLength(trimmedText);
    if (!textValidation.valid) {
      throw new Error(textValidation.error);
    }
    
    // Truncate if extremely long (cost protection)
    if (trimmedText.length > 50000) {
      console.log(`⚠️ Text truncated from ${trimmedText.length} to 50000 characters`);
      extractedText = trimmedText.substring(0, 50000) + '\n\n[TEXT TRUNCATED - Original length: ' + trimmedText.length + ' characters]';
    } else {
      extractedText = trimmedText;
    }

    console.log(`Extracted ${extractedText.length} characters`);

    // Update database with extracted text
    if (documentId) {
      const { error: updateError } = await supabase
        .from('claim_letters')
        .update({
          extracted_text: extractedText,
          letter_text: extractedText,
          status: 'extracted'
        })
        .eq('id', documentId);

      if (updateError) {
        console.error('Failed to update document:', updateError);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        extractedText,
        characterCount: extractedText.length,
        documentId
      })
    };

  } catch (error) {
    console.error('Text extraction error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Text extraction failed',
        details: error.message
      })
    };
  }
};
