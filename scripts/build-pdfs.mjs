import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { handbook } from "../src/content/handbook.js";
import { runbook } from "../src/content/runbook.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "pdf");
const fontPath = path.join(rootDir, "assets", "fonts", "NotoSansKR-Regular.ttf");
const boldFontPath = path.join(rootDir, "assets", "fonts", "NotoSansKR-Bold.ttf");

const page = {
  width: 595.28,
  height: 841.89,
  marginX: 56,
  marginTop: 64,
  marginBottom: 64,
};

function wrapText(text, font, size, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    let chunk = "";
    for (const char of word) {
      const candidate = chunk + char;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        chunk = candidate;
      } else {
        if (chunk) {
          lines.push(chunk);
        }
        chunk = char;
      }
    }
    current = chunk;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function drawLine(ctx, text, options = {}) {
  const {
    size = 11,
    color = rgb(0.12, 0.15, 0.21),
    font = ctx.regularFont,
    indent = 0,
    gapAfter = 6,
    bullet = null,
  } = options;
  const usableWidth = page.width - page.marginX * 2 - indent;
  const prefix = bullet ? `${bullet} ` : "";
  const prefixWidth = bullet ? font.widthOfTextAtSize(prefix, size) : 0;
  const lineWidth = usableWidth - prefixWidth;
  const lines = wrapText(text, font, size, lineWidth);

  for (const [index, line] of lines.entries()) {
    ensureSpace(ctx, size + 4);
    const x = page.marginX + indent + (index === 0 ? 0 : prefixWidth);
    if (index === 0 && bullet) {
      ctx.page.drawText(prefix, {
        x: page.marginX + indent,
        y: ctx.cursorY,
        size,
        font,
        color,
      });
    }
    ctx.page.drawText(line, {
      x,
      y: ctx.cursorY,
      size,
      font,
      color,
    });
    ctx.cursorY -= size + 4;
  }

  ctx.cursorY -= gapAfter;
}

function ensureSpace(ctx, requiredHeight) {
  if (ctx.cursorY - requiredHeight >= page.marginBottom) {
    return;
  }

  ctx.page = ctx.pdfDoc.addPage([page.width, page.height]);
  ctx.cursorY = page.height - page.marginTop;
}

function drawHeader(ctx, documentData) {
  drawLine(ctx, documentData.title, {
    font: ctx.boldFont,
    size: 22,
    color: rgb(0.05, 0.11, 0.27),
    gapAfter: 8,
  });
  drawLine(ctx, documentData.subtitle, {
    size: 13,
    color: rgb(0.24, 0.31, 0.43),
    gapAfter: 14,
  });
  drawLine(ctx, `Version ${documentData.version} | Updated ${documentData.updatedAt}`, {
    size: 10,
    color: rgb(0.38, 0.44, 0.56),
    gapAfter: 20,
  });
}

async function buildDocument(documentData, outputName) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontBytes = fs.readFileSync(fontPath);
  const boldFontBytes = fs.readFileSync(boldFontPath);
  const regularFont = await pdfDoc.embedFont(regularFontBytes, { subset: true });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: true });

  const ctx = {
    pdfDoc,
    regularFont,
    boldFont,
    page: pdfDoc.addPage([page.width, page.height]),
    cursorY: page.height - page.marginTop,
  };

  drawHeader(ctx, documentData);

  for (const section of documentData.sections) {
    drawLine(ctx, section.title, {
      font: boldFont,
      size: 15,
      color: rgb(0.06, 0.18, 0.46),
      gapAfter: 10,
    });

    for (const item of section.items) {
      drawLine(ctx, item, {
        bullet: "•",
        indent: 8,
      });
    }

    if (section.callout) {
      drawLine(ctx, section.callout, {
        size: 10.5,
        color: rgb(0.35, 0.22, 0.1),
        gapAfter: 14,
      });
    } else {
      ctx.cursorY -= 6;
    }
  }

  const bytes = await pdfDoc.save();
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, outputName), bytes);
}

await buildDocument(handbook, "agentops-classroom-handbook.pdf");
await buildDocument(runbook, "agentops-classroom-runbook.pdf");
