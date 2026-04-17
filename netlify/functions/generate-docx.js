const { Document, Packer, Paragraph, TextRun } = require("docx");

const RUN_SIZE = 24; // 12pt

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
    const { text, fileName = "response-letter.docx" } = JSON.parse(event.body || "{}");

    if (!text) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "No text provided for DOCX generation" }),
      };
    }

    const lines = String(text).replace(/\r\n/g, "\n").split("\n");
    const children = [];

    for (const line of lines) {
      if (line === "") {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: "", size: RUN_SIZE })],
          })
        );
        continue;
      }

      const trimmed = line.trim();
      const isHeader = /^[A-Z\s\/]+$/.test(trimmed) && trimmed.length > 3;

      if (isHeader) {
        children.push(
          new Paragraph({
            spacing: { before: 240, after: 120 },
            children: [
              new TextRun({
                text: line,
                bold: true,
                size: RUN_SIZE,
              }),
            ],
          })
        );
      } else {
        children.push(
          new Paragraph({
            spacing: { after: 160, line: 276 },
            children: [new TextRun({ text: line, size: RUN_SIZE })],
          })
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Access-Control-Allow-Origin": "*",
      },
      body: Buffer.from(buffer).toString("base64"),
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
        error: "Failed to generate DOCX",
        details: error.message,
      }),
    };
  }
};
