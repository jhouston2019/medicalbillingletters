/**
 * FILE VALIDATION - SERVER-SIDE ONLY
 * 
 * NO TRUST OF FRONTEND VALIDATION
 */

const pdfParse = require('pdf-parse');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_PDF_PAGES = 15;
const MIN_TEXT_LENGTH = 50;

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png'
];

/**
 * Validate file size
 * @param {number} fileSize - File size in bytes
 * @returns {object} - Validation result
 */
function validateFileSize(fileSize) {
  if (!fileSize || fileSize === 0) {
    return {
      valid: false,
      error: 'File size is 0 or undefined'
    };
  }

  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size (${Math.round(fileSize / 1024 / 1024)}MB) exceeds maximum allowed (10MB)`
    };
  }

  return { valid: true };
}

/**
 * Validate MIME type
 * @param {string} mimeType - File MIME type
 * @param {string} fileName - File name
 * @returns {object} - Validation result
 */
function validateMimeType(mimeType, fileName) {
  if (!mimeType) {
    return {
      valid: false,
      error: 'MIME type not provided'
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
    return {
      valid: false,
      error: `Unsupported file type: ${mimeType}. Only PDF, JPG, and PNG are allowed.`
    };
  }

  // Additional check: verify file extension matches MIME type
  const extension = fileName.toLowerCase().split('.').pop();
  const expectedExtensions = {
    'application/pdf': ['pdf'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/jpg': ['jpg', 'jpeg'],
    'image/png': ['png']
  };

  const validExtensions = expectedExtensions[mimeType.toLowerCase()] || [];
  if (!validExtensions.includes(extension)) {
    return {
      valid: false,
      error: `File extension .${extension} does not match MIME type ${mimeType}`
    };
  }

  return { valid: true };
}

/**
 * Validate PDF page count
 * @param {Buffer} fileBuffer - PDF file buffer
 * @returns {Promise<object>} - Validation result
 */
async function validatePdfPageCount(fileBuffer) {
  try {
    const pdfData = await pdfParse(fileBuffer, {
      max: 0 // Don't extract text, just get metadata
    });

    if (pdfData.numpages > MAX_PDF_PAGES) {
      return {
        valid: false,
        error: `PDF has ${pdfData.numpages} pages. Maximum allowed: ${MAX_PDF_PAGES} pages.`
      };
    }

    return {
      valid: true,
      pageCount: pdfData.numpages
    };
  } catch (error) {
    return {
      valid: false,
      error: 'PDF file is corrupted or invalid'
    };
  }
}

/**
 * Validate extracted text length
 * @param {string} text - Extracted text
 * @returns {object} - Validation result
 */
function validateTextLength(text) {
  if (!text || text.trim().length < MIN_TEXT_LENGTH) {
    return {
      valid: false,
      error: `Extracted text is too short (${text ? text.trim().length : 0} characters). Minimum required: ${MIN_TEXT_LENGTH} characters. The file may be empty or contain only images.`
    };
  }

  return {
    valid: true,
    length: text.trim().length
  };
}

/**
 * Comprehensive file validation
 * @param {object} file - File object with size, type, name, buffer
 * @returns {Promise<object>} - Validation result
 */
async function validateFile(file) {
  const errors = [];

  // 1. Validate file size
  const sizeCheck = validateFileSize(file.size);
  if (!sizeCheck.valid) {
    errors.push(sizeCheck.error);
  }

  // 2. Validate MIME type
  const mimeCheck = validateMimeType(file.type, file.name);
  if (!mimeCheck.valid) {
    errors.push(mimeCheck.error);
  }

  // 3. If PDF, validate page count
  if (file.type === 'application/pdf' && file.buffer) {
    const pageCheck = await validatePdfPageCount(file.buffer);
    if (!pageCheck.valid) {
      errors.push(pageCheck.error);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors: errors
    };
  }

  return {
    valid: true
  };
}

module.exports = {
  validateFileSize,
  validateMimeType,
  validatePdfPageCount,
  validateTextLength,
  validateFile,
  MAX_FILE_SIZE,
  MAX_PDF_PAGES,
  MIN_TEXT_LENGTH,
  ALLOWED_MIME_TYPES
};
