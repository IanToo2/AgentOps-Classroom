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

const pg = {
  width: 595.28,
  height: 841.89,
  marginX: 56,
  marginTop: 64,
  marginBottom: 64,
};

const usableWidth = pg.width - pg.marginX * 2;

// ── Color palette ──────────────────────────────────────────────
const colors = {
  text: rgb(0.12, 0.15, 0.21),
  heading: rgb(0.05, 0.11, 0.27),
  sectionTitle: rgb(0.06, 0.18, 0.46),
  subtitle: rgb(0.24, 0.31, 0.43),
  meta: rgb(0.38, 0.44, 0.56),
  info: { border: rgb(0.13, 0.35, 0.68), bg: rgb(0.92, 0.95, 1.0) },
  warning: { border: rgb(0.72, 0.52, 0.08), bg: rgb(1.0, 0.97, 0.88) },
  tip: { border: rgb(0.12, 0.47, 0.22), bg: rgb(0.91, 0.97, 0.92) },
  comparisonGood: rgb(0.91, 0.97, 0.92),
  comparisonBad: rgb(0.98, 0.92, 0.91),
  tableHeader: rgb(0.93, 0.94, 0.96),
  tableGrid: rgb(0.78, 0.82, 0.87),
  divider: rgb(0.78, 0.82, 0.87),
  scenarioBg: rgb(0.96, 0.97, 0.98),
  scenarioBorder: rgb(0.78, 0.82, 0.87),
};

// ── Text utilities ─────────────────────────────────────────────
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
      // check if single word exceeds width
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const char of word) {
          const candidate = chunk + char;
          if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            chunk = candidate;
          } else {
            if (chunk) lines.push(chunk);
            chunk = char;
          }
        }
        current = chunk;
      }
      continue;
    }
    // first word, no current yet — character wrap
    let chunk = "";
    for (const char of word) {
      const candidate = chunk + char;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        chunk = candidate;
      } else {
        if (chunk) lines.push(chunk);
        chunk = char;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  return lines;
}

function measureTextHeight(text, font, size, maxWidth, lineGap = 4) {
  const lines = wrapText(text, font, size, maxWidth);
  return lines.length * (size + lineGap);
}

// ── Page / cursor helpers ──────────────────────────────────────
function addNewPage(ctx) {
  ctx.page = ctx.pdfDoc.addPage([pg.width, pg.height]);
  ctx.cursorY = pg.height - pg.marginTop;
  ctx.pageCount++;
}

function ensureSpace(ctx, requiredHeight) {
  if (ctx.cursorY - requiredHeight >= pg.marginBottom) return;
  addNewPage(ctx);
}

// ── Low-level draw helpers ─────────────────────────────────────
function drawTextLine(ctx, text, options = {}) {
  const {
    size = 11,
    color = colors.text,
    font = ctx.regularFont,
    indent = 0,
    gapAfter = 6,
    bullet = null,
    maxWidth = null,
  } = options;
  const effectiveWidth = (maxWidth || usableWidth) - indent;
  const prefix = bullet ? `${bullet} ` : "";
  const prefixWidth = bullet ? font.widthOfTextAtSize(prefix, size) : 0;
  const lineWidth = effectiveWidth - prefixWidth;
  const lines = wrapText(text, font, size, lineWidth);

  for (const [index, line] of lines.entries()) {
    ensureSpace(ctx, size + 4);
    const x = pg.marginX + indent + (index === 0 ? 0 : prefixWidth);
    if (index === 0 && bullet) {
      ctx.page.drawText(prefix, {
        x: pg.marginX + indent,
        y: ctx.cursorY,
        size,
        font,
        color,
      });
    }
    ctx.page.drawText(line, { x, y: ctx.cursorY, size, font, color });
    ctx.cursorY -= size + 4;
  }
  ctx.cursorY -= gapAfter;
}

function drawRect(ctx, x, y, w, h, color) {
  ctx.page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawHLine(ctx, x1, x2, y, color, thickness = 0.75) {
  ctx.page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness,
    color,
  });
}

function drawVLine(ctx, x, y1, y2, color, thickness = 0.75) {
  ctx.page.drawLine({
    start: { x, y: y1 },
    end: { x, y: y2 },
    thickness,
    color,
  });
}

// ── Block renderers ────────────────────────────────────────────

function drawParagraph(ctx, block) {
  drawTextLine(ctx, block.text, { gapAfter: 10 });
}

function drawBullets(ctx, block) {
  for (const item of block.items) {
    drawTextLine(ctx, item, { bullet: "•", indent: 8 });
  }
  ctx.cursorY -= 4;
}

function drawNumberedList(ctx, block) {
  for (let i = 0; i < block.items.length; i++) {
    const label = `${i + 1}.`;
    drawTextLine(ctx, block.items[i], { bullet: label, indent: 8 });
  }
  ctx.cursorY -= 4;
}

function drawCalloutBox(ctx, block) {
  const style = block.style || "info";
  const palette = colors[style] || colors.info;
  const padX = 12;
  const padY = 10;
  const accentWidth = 4;
  const boxWidth = usableWidth;
  const textWidth = boxWidth - padX * 2 - accentWidth;
  const textH = measureTextHeight(block.text, ctx.regularFont, 10.5, textWidth, 4);
  const boxH = textH + padY * 2;

  ensureSpace(ctx, boxH + 8);
  const boxTop = ctx.cursorY + 12;
  const boxLeft = pg.marginX;

  // background
  drawRect(ctx, boxLeft, boxTop - boxH, boxWidth, boxH, palette.bg);
  // accent bar
  drawRect(ctx, boxLeft, boxTop - boxH, accentWidth, boxH, palette.border);

  // text
  const lines = wrapText(block.text, ctx.regularFont, 10.5, textWidth);
  let ty = boxTop - padY - 10.5;
  for (const line of lines) {
    ctx.page.drawText(line, {
      x: boxLeft + accentWidth + padX,
      y: ty,
      size: 10.5,
      font: ctx.regularFont,
      color: colors.text,
    });
    ty -= 14.5;
  }

  ctx.cursorY = boxTop - boxH - 10;
}

function drawTable(ctx, block) {
  const { headers, rows } = block;
  const colCount = headers.length;
  const cellPadX = 6;
  const cellPadY = 5;
  const fontSize = 9.5;
  const lineGap = 3;
  const tableWidth = usableWidth;

  // Calculate column widths proportionally based on content
  const colWidths = calculateColumnWidths(ctx, headers, rows, tableWidth, fontSize, cellPadX);

  // Helper: measure row height
  function rowHeight(cells, font) {
    let maxH = 0;
    for (let c = 0; c < colCount; c++) {
      const tw = colWidths[c] - cellPadX * 2;
      const h = measureTextHeight(cells[c] || "", font, fontSize, tw, lineGap);
      if (h > maxH) maxH = h;
    }
    return maxH + cellPadY * 2;
  }

  // Draw one row
  function drawRow(cells, font, bgColor, isHeader) {
    const rh = rowHeight(cells, font);
    ensureSpace(ctx, rh + 2);
    const rowTop = ctx.cursorY;
    let x = pg.marginX;

    // background
    if (bgColor) drawRect(ctx, pg.marginX, rowTop - rh, tableWidth, rh, bgColor);

    // cell text
    for (let c = 0; c < colCount; c++) {
      const tw = colWidths[c] - cellPadX * 2;
      const lines = wrapText(cells[c] || "", font, fontSize, tw);
      let ty = rowTop - cellPadY - fontSize;
      for (const line of lines) {
        ctx.page.drawText(line, {
          x: x + cellPadX,
          y: ty,
          size: fontSize,
          font,
          color: colors.text,
        });
        ty -= fontSize + lineGap;
      }
      x += colWidths[c];
    }

    // grid lines
    // horizontal bottom
    drawHLine(ctx, pg.marginX, pg.marginX + tableWidth, rowTop - rh, colors.tableGrid);
    // vertical separators
    x = pg.marginX;
    for (let c = 0; c <= colCount; c++) {
      drawVLine(ctx, x, rowTop, rowTop - rh, colors.tableGrid);
      x += colWidths[c] || 0;
    }
    // top line for header
    if (isHeader) {
      drawHLine(ctx, pg.marginX, pg.marginX + tableWidth, rowTop, colors.tableGrid);
    }

    ctx.cursorY = rowTop - rh;
  }

  // Header
  drawRow(headers, ctx.boldFont, colors.tableHeader, true);

  // Rows with page-break header re-render
  for (const row of rows) {
    const rh = rowHeight(row, ctx.regularFont);
    if (ctx.cursorY - rh < pg.marginBottom) {
      addNewPage(ctx);
      drawRow(headers, ctx.boldFont, colors.tableHeader, true);
    }
    drawRow(row, ctx.regularFont, null, false);
  }

  ctx.cursorY -= 10;
}

function calculateColumnWidths(ctx, headers, rows, tableWidth, fontSize, cellPadX) {
  const colCount = headers.length;
  // Measure max content width per column
  const maxWidths = new Array(colCount).fill(0);
  for (let c = 0; c < colCount; c++) {
    const hw = ctx.boldFont.widthOfTextAtSize(headers[c], fontSize) + cellPadX * 2;
    maxWidths[c] = hw;
    for (const row of rows) {
      const rw = ctx.regularFont.widthOfTextAtSize(row[c] || "", fontSize) + cellPadX * 2;
      if (rw > maxWidths[c]) maxWidths[c] = rw;
    }
  }
  // Distribute proportionally, but cap each col to 50% of table width
  const total = maxWidths.reduce((a, b) => a + b, 0);
  const widths = maxWidths.map((w) => Math.min((w / total) * tableWidth, tableWidth * 0.5));
  // Adjust to fit exactly
  const sum = widths.reduce((a, b) => a + b, 0);
  const ratio = tableWidth / sum;
  return widths.map((w) => w * ratio);
}

function drawComparison(ctx, block) {
  const { bad, good } = block;
  const padX = 10;
  const padY = 8;
  const gap = 10;
  const halfWidth = (usableWidth - gap) / 2;
  const textWidth = halfWidth - padX * 2;
  const fontSize = 10;
  const labelSize = 10;

  // measure heights
  const badLabelH = labelSize + 6;
  const goodLabelH = labelSize + 6;
  const badTextH = measureTextHeight(bad.text, ctx.regularFont, fontSize, textWidth, 4);
  const goodTextH = measureTextHeight(good.text, ctx.regularFont, fontSize, textWidth, 4);
  const boxH = Math.max(badLabelH + badTextH, goodLabelH + goodTextH) + padY * 2;

  ensureSpace(ctx, boxH + 8);
  const boxTop = ctx.cursorY + 8;
  const leftX = pg.marginX;
  const rightX = pg.marginX + halfWidth + gap;

  // Bad box
  drawRect(ctx, leftX, boxTop - boxH, halfWidth, boxH, colors.comparisonBad);
  ctx.page.drawText(bad.label || "Bad", {
    x: leftX + padX,
    y: boxTop - padY - labelSize,
    size: labelSize,
    font: ctx.boldFont,
    color: rgb(0.6, 0.15, 0.15),
  });
  const badLines = wrapText(bad.text, ctx.regularFont, fontSize, textWidth);
  let by = boxTop - padY - badLabelH - fontSize;
  for (const line of badLines) {
    ctx.page.drawText(line, { x: leftX + padX, y: by, size: fontSize, font: ctx.regularFont, color: colors.text });
    by -= fontSize + 4;
  }

  // Good box
  drawRect(ctx, rightX, boxTop - boxH, halfWidth, boxH, colors.comparisonGood);
  ctx.page.drawText(good.label || "Good", {
    x: rightX + padX,
    y: boxTop - padY - labelSize,
    size: labelSize,
    font: ctx.boldFont,
    color: rgb(0.1, 0.4, 0.15),
  });
  const goodLines = wrapText(good.text, ctx.regularFont, fontSize, textWidth);
  let gy = boxTop - padY - goodLabelH - fontSize;
  for (const line of goodLines) {
    ctx.page.drawText(line, { x: rightX + padX, y: gy, size: fontSize, font: ctx.regularFont, color: colors.text });
    gy -= fontSize + 4;
  }

  ctx.cursorY = boxTop - boxH - 10;
}

function drawDefinition(ctx, block) {
  ensureSpace(ctx, 30);
  drawTextLine(ctx, `${block.term}`, {
    font: ctx.boldFont,
    size: 11,
    gapAfter: 2,
    indent: 4,
  });
  drawTextLine(ctx, block.explanation, {
    size: 10.5,
    indent: 16,
    gapAfter: 8,
  });
}

function drawScenario(ctx, block) {
  const padX = 12;
  const padY = 10;
  const boxWidth = usableWidth;
  const textWidth = boxWidth - padX * 2;
  const fontSize = 10;
  const labelSize = 10;
  const lineGap = 4;

  // Compute height
  let contentH = 0;
  if (block.title) contentH += labelSize + 10;
  const labelPairs = [];
  if (block.situation) labelPairs.push(["상황", block.situation]);
  if (block.action) labelPairs.push(["조치", block.action]);
  if (block.result) labelPairs.push(["결과", block.result]);

  for (const [, text] of labelPairs) {
    contentH += labelSize + 4;
    contentH += measureTextHeight(text, ctx.regularFont, fontSize, textWidth - 40, lineGap);
    contentH += 4;
  }
  const boxH = contentH + padY * 2;

  ensureSpace(ctx, boxH + 8);
  const boxTop = ctx.cursorY + 8;
  const boxLeft = pg.marginX;

  // background + border
  drawRect(ctx, boxLeft, boxTop - boxH, boxWidth, boxH, colors.scenarioBg);
  drawHLine(ctx, boxLeft, boxLeft + boxWidth, boxTop, colors.scenarioBorder);
  drawHLine(ctx, boxLeft, boxLeft + boxWidth, boxTop - boxH, colors.scenarioBorder);
  drawVLine(ctx, boxLeft, boxTop, boxTop - boxH, colors.scenarioBorder);
  drawVLine(ctx, boxLeft + boxWidth, boxTop, boxTop - boxH, colors.scenarioBorder);

  let ty = boxTop - padY;

  // title
  if (block.title) {
    ty -= labelSize;
    ctx.page.drawText(block.title, {
      x: boxLeft + padX,
      y: ty,
      size: labelSize + 1,
      font: ctx.boldFont,
      color: colors.sectionTitle,
    });
    ty -= 10;
  }

  // label rows
  for (const [label, text] of labelPairs) {
    ty -= labelSize;
    ctx.page.drawText(`${label}:`, {
      x: boxLeft + padX,
      y: ty,
      size: labelSize,
      font: ctx.boldFont,
      color: colors.text,
    });
    ty -= 4;
    const lines = wrapText(text, ctx.regularFont, fontSize, textWidth - 40);
    for (const line of lines) {
      ty -= fontSize;
      ctx.page.drawText(line, {
        x: boxLeft + padX + 40,
        y: ty,
        size: fontSize,
        font: ctx.regularFont,
        color: colors.text,
      });
      ty -= lineGap;
    }
    ty -= 4;
  }

  ctx.cursorY = boxTop - boxH - 10;
}

function drawDivider(ctx) {
  ensureSpace(ctx, 16);
  ctx.cursorY -= 6;
  drawHLine(ctx, pg.marginX, pg.marginX + usableWidth, ctx.cursorY, colors.divider);
  ctx.cursorY -= 10;
}

function drawGlossary(ctx, glossary) {
  if (!glossary || glossary.length === 0) return;

  ensureSpace(ctx, 40);
  drawTextLine(ctx, "용어 사전 (Glossary)", {
    font: ctx.boldFont,
    size: 15,
    color: colors.sectionTitle,
    gapAfter: 10,
  });

  // Render as a 2-column table
  drawTable(ctx, {
    headers: ["용어", "설명"],
    rows: glossary.map((g) => [g.term, g.definition]),
  });
}

// ── Block dispatcher ───────────────────────────────────────────
function renderBlock(ctx, block) {
  switch (block.type) {
    case "paragraph":
      drawParagraph(ctx, block);
      break;
    case "bullets":
      drawBullets(ctx, block);
      break;
    case "numbered-list":
      drawNumberedList(ctx, block);
      break;
    case "callout":
      drawCalloutBox(ctx, block);
      break;
    case "table":
      drawTable(ctx, block);
      break;
    case "comparison":
      drawComparison(ctx, block);
      break;
    case "definition":
      drawDefinition(ctx, block);
      break;
    case "scenario":
      drawScenario(ctx, block);
      break;
    case "divider":
      drawDivider(ctx);
      break;
    default:
      // Fallback: treat as paragraph if text exists
      if (block.text) drawParagraph(ctx, block);
      break;
  }
}

// ── Page numbers ───────────────────────────────────────────────
function addPageNumbers(pdfDoc, font) {
  const pages = pdfDoc.getPages();
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    const p = pages[i];
    const label = `${i + 1} / ${total}`;
    const labelWidth = font.widthOfTextAtSize(label, 9);
    p.drawText(label, {
      x: (pg.width - labelWidth) / 2,
      y: pg.marginBottom - 24,
      size: 9,
      font,
      color: colors.meta,
    });
  }
}

// ── Header ─────────────────────────────────────────────────────
function drawHeader(ctx, documentData) {
  drawTextLine(ctx, documentData.title, {
    font: ctx.boldFont,
    size: 22,
    color: colors.heading,
    gapAfter: 8,
  });
  drawTextLine(ctx, documentData.subtitle, {
    size: 13,
    color: colors.subtitle,
    gapAfter: 14,
  });
  drawTextLine(ctx, `Version ${documentData.version} | Updated ${documentData.updatedAt}`, {
    size: 10,
    color: colors.meta,
    gapAfter: 20,
  });
}

// ── Main build ─────────────────────────────────────────────────
async function buildDocument(documentData, outputName) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontBytes = fs.readFileSync(fontPath);
  const boldFontBytes = fs.readFileSync(boldFontPath);
  const regularFont = await pdfDoc.embedFont(regularFontBytes, { subset: false });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: false });

  // Metadata
  pdfDoc.setTitle(documentData.title);
  pdfDoc.setAuthor("AgentOps Classroom");
  pdfDoc.setSubject(documentData.subtitle);

  const ctx = {
    pdfDoc,
    regularFont,
    boldFont,
    page: pdfDoc.addPage([pg.width, pg.height]),
    cursorY: pg.height - pg.marginTop,
    pageCount: 1,
  };

  drawHeader(ctx, documentData);

  for (const section of documentData.sections) {
    // Section title
    ensureSpace(ctx, 40);
    drawTextLine(ctx, section.title, {
      font: boldFont,
      size: 15,
      color: colors.sectionTitle,
      gapAfter: 10,
    });

    // New blocks-based rendering
    if (section.blocks) {
      for (const block of section.blocks) {
        renderBlock(ctx, block);
      }
    }

    // Legacy support: items array
    if (section.items) {
      for (const item of section.items) {
        drawTextLine(ctx, item, { bullet: "•", indent: 8 });
      }
    }

    // Legacy support: callout string
    if (section.callout && typeof section.callout === "string") {
      drawTextLine(ctx, section.callout, {
        size: 10.5,
        color: rgb(0.35, 0.22, 0.1),
        gapAfter: 14,
      });
    }

    ctx.cursorY -= 6;
  }

  // Glossary
  if (documentData.glossary) {
    drawGlossary(ctx, documentData.glossary);
  }

  // Page numbers
  addPageNumbers(pdfDoc, regularFont);

  const bytes = await pdfDoc.save();
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, outputName), bytes);
}

await buildDocument(handbook, "agentops-classroom-handbook.pdf");
await buildDocument(runbook, "agentops-classroom-runbook.pdf");
