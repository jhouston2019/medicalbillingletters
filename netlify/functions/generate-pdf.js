const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { text, fileName = 'response-letter.pdf' } = JSON.parse(event.body || '{}');
    
    if (!text) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'No text provided for PDF generation' })
      };
    }
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Standard letter size
    
    // Get fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Set up text formatting
    const fontSize = 12;
    const lineHeight = fontSize * 1.2;
    const margin = 50;
    const maxWidth = page.getWidth() - (margin * 2);
    
    // Split text into lines that fit the page width
    const lines = [];
    const words = text.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      const textWidth = font.widthOfTextAtSize(testLine, fontSize);
      
      if (textWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          lines.push(word);
        }
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    
    // Draw the text (track current page for multi-page letters)
    let currentPage = page;
    let yPosition = currentPage.getHeight() - margin;

    for (const line of lines) {
      if (yPosition < margin) {
        currentPage = pdfDoc.addPage([612, 792]);
        yPosition = currentPage.getHeight() - margin;
      }
      currentPage.drawText(line, {
        x: margin,
        y: yPosition,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
      });
      yPosition -= lineHeight;
    }
    
    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Access-Control-Allow-Origin': '*'
      },
      body: Buffer.from(pdfBytes).toString("base64"),
      isBase64Encoded: true
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Failed to generate PDF',
        details: error.message 
      })
    };
  }
}
