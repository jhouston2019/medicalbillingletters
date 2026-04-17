const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const FONT_SIZE = 12;
const LINE_HEIGHT = FONT_SIZE * 1.2;
const MARGIN = 50;
const PAGE_SIZE = [612, 792];

function wrapLineToWidth(textLine, font, size, maxWidth) {
  const lines = [];
  const words = String(textLine).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return textLine.trim() === "" ? [] : [""];
  }
  let currentLine = "";
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const w = font.widthOfTextAtSize(testLine, size);
    if (w <= maxWidth) {
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
  if (currentLine) lines.push(currentLine);
  return lines;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  try {
    const { text, fileName = "response-letter.pdf" } = JSON.parse(event.body || "{}");

    if (!text) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "No text provided for PDF generation" }),
      };
    }

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let currentPage = pdfDoc.addPage(PAGE_SIZE);
    let yPosition = currentPage.getHeight() - MARGIN;
    const maxWidth = currentPage.getWidth() - MARGIN * 2;

    const rawLines = String(text).replace(/\r\n/g, "\n").split("\n");

    for (const rawLine of rawLines) {
      if (rawLine === "") {
        if (yPosition < MARGIN + LINE_HEIGHT * 0.5) {
          currentPage = pdfDoc.addPage(PAGE_SIZE);
          yPosition = currentPage.getHeight() - MARGIN;
        }
        yPosition -= LINE_HEIGHT * 0.5;
        continue;
      }

      const trimmed = rawLine.trim();
      const isHeader = /^[A-Z\s\/]+$/.test(trimmed) && trimmed.length > 3;

      if (isHeader) {
        if (yPosition - LINE_HEIGHT < MARGIN) {
          currentPage = pdfDoc.addPage(PAGE_SIZE);
          yPosition = currentPage.getHeight() - MARGIN;
        }
        yPosition -= LINE_HEIGHT;
      }

      const measureFont = isHeader ? boldFont : font;
      const segments = wrapLineToWidth(rawLine, measureFont, FONT_SIZE, maxWidth);

      for (const segment of segments) {
        if (yPosition < MARGIN) {
          currentPage = pdfDoc.addPage(PAGE_SIZE);
          yPosition = currentPage.getHeight() - MARGIN;
        }
        currentPage.drawText(segment, {
          x: MARGIN,
          y: yPosition,
          size: FONT_SIZE,
          font: isHeader ? boldFont : font,
          color: rgb(0, 0, 0),
        });
        yPosition -= LINE_HEIGHT;
      }
    }

    const pdfBytes = await pdfDoc.save();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Access-Control-Allow-Origin": "*",
      },
      body: Buffer.from(pdfBytes).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        error: "Failed to generate PDF",
        details: error.message,
      }),
    };
  }
};
