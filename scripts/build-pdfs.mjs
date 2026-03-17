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
const imagesDir = path.join(rootDir, "assets", "images");
const fontPath = path.join(rootDir, "assets", "fonts", "NotoSansKR-Regular.ttf");
const boldFontPath = path.join(rootDir, "assets", "fonts", "NotoSansKR-Bold.ttf");

// ── Page layout (wider margins for Apple-style breathing room) ──
const pg = {
  width: 595.28,
  height: 841.89,
  marginX: 72,
  marginTop: 80,
  marginBottom: 72,
};

const usableWidth = pg.width - pg.marginX * 2;

// ── Color palette (Apple monochrome) ─────────────────────────────
const colors = {
  text:         rgb(0.114, 0.114, 0.122),   // #1d1d1f
  heading:      rgb(0.114, 0.114, 0.122),
  sectionTitle: rgb(0.114, 0.114, 0.122),
  subtitle:     rgb(0.424, 0.424, 0.447),   // #6c6c72
  meta:         rgb(0.557, 0.557, 0.576),   // #8e8e93
  callout:      { bg: rgb(0.969, 0.969, 0.973), border: rgb(0.898, 0.898, 0.910) },
  comparisonBad:        rgb(0.988, 0.961, 0.961),
  comparisonGood:       rgb(0.957, 0.980, 0.961),
  comparisonBadAccent:  rgb(0.85, 0.20, 0.15),
  comparisonGoodAccent: rgb(0.15, 0.55, 0.25),
  tableHeaderBg:  rgb(0.969, 0.969, 0.973),
  tableGrid:      rgb(0.898, 0.898, 0.910),
  tableZebra:     rgb(0.976, 0.976, 0.980),
  divider:        rgb(0.898, 0.898, 0.910),
  scenarioBg:     rgb(0.969, 0.969, 0.973),
  scenarioBorder: rgb(0.898, 0.898, 0.910),
};

// ── Text utilities ─────────────────────────────────────────────
function wrapText(text, font, size, maxWidth) {
  const safeWidth = maxWidth - 2;
  const words = text.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= safeWidth) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
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

function measureTextHeight(text, font, size, maxWidth, lineGap = 7) {
  const lines = wrapText(text, font, size, maxWidth);
  return lines.length * (size + lineGap);
}

// ── Rounded rectangle helper ──────────────────────────────────
function roundedRectSvgPath(w, h, r) {
  // SVG path for a rounded rectangle starting at origin (0,0) top-left
  // Y-axis goes down in SVG convention; pdf-lib drawSvgPath flips Y
  r = Math.min(r, w / 2, h / 2);
  return [
    `M ${r} 0`,
    `L ${w - r} 0`,
    `Q ${w} 0 ${w} ${r}`,
    `L ${w} ${h - r}`,
    `Q ${w} ${h} ${w - r} ${h}`,
    `L ${r} ${h}`,
    `Q 0 ${h} 0 ${h - r}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0`,
    `Z`,
  ].join(" ");
}

function drawRoundedRect(page, x, y, w, h, r, { fill, stroke, strokeWidth = 0.75 } = {}) {
  // x, y = bottom-left corner in PDF coordinates
  const svgPath = roundedRectSvgPath(w, h, r);
  // drawSvgPath places the SVG origin at (x, y + h) because it flips Y
  if (fill) {
    page.drawSvgPath(svgPath, {
      x,
      y: y + h,
      color: fill,
      borderWidth: 0,
    });
  }
  if (stroke) {
    page.drawSvgPath(svgPath, {
      x,
      y: y + h,
      borderColor: stroke,
      borderWidth: strokeWidth,
    });
  }
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
    lineGap = 7,
  } = options;
  const effectiveWidth = (maxWidth || usableWidth) - indent;
  const prefix = bullet ? `${bullet} ` : "";
  const prefixWidth = bullet ? font.widthOfTextAtSize(prefix, size) : 0;
  const lineWidth = effectiveWidth - prefixWidth;
  const lines = wrapText(text, font, size, lineWidth);

  for (const [index, line] of lines.entries()) {
    ensureSpace(ctx, size + lineGap);
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
    ctx.cursorY -= size + lineGap;
  }
  ctx.cursorY -= gapAfter;
}

function drawRect(ctx, x, y, w, h, color) {
  ctx.page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawHLine(ctx, x1, x2, y, color, thickness = 0.5) {
  ctx.page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness,
    color,
  });
}

// ── Block renderers ────────────────────────────────────────────

function drawParagraph(ctx, block) {
  drawTextLine(ctx, block.text, { gapAfter: 14 });
}

function drawBullets(ctx, block) {
  for (const item of block.items) {
    drawTextLine(ctx, item, { bullet: "•", indent: 12 });
  }
  ctx.cursorY -= 10;
}

function drawNumberedList(ctx, block) {
  for (let i = 0; i < block.items.length; i++) {
    const label = `${i + 1}.`;
    drawTextLine(ctx, block.items[i], { bullet: label, indent: 12 });
  }
  ctx.cursorY -= 10;
}

function drawCalloutBox(ctx, block) {
  const style = block.style || "info";
  const prefixMap = { info: "참고", warning: "주의", tip: "팁" };
  const prefix = prefixMap[style] || "참고";
  const padX = 16;
  const padY = 14;
  const boxWidth = usableWidth;
  const textWidth = boxWidth - padX * 2;
  const fontSize = 11;
  const lineGap = 5;

  // Measure prefix line + text
  const prefixH = fontSize + 6;
  const textH = measureTextHeight(block.text, ctx.regularFont, fontSize, textWidth, lineGap);
  const boxH = prefixH + textH + padY * 2;

  ensureSpace(ctx, boxH + 10);
  const boxTop = ctx.cursorY + 10;
  const boxLeft = pg.marginX;
  const boxBottom = boxTop - boxH;

  // Rounded rectangle background + border
  drawRoundedRect(ctx.page, boxLeft, boxBottom, boxWidth, boxH, 8, {
    fill: colors.callout.bg,
    stroke: colors.callout.border,
    strokeWidth: 0.75,
  });

  // Bold prefix label
  let ty = boxTop - padY - fontSize;
  ctx.page.drawText(prefix, {
    x: boxLeft + padX,
    y: ty,
    size: fontSize,
    font: ctx.boldFont,
    color: colors.text,
  });
  ty -= fontSize + 6;

  // Body text
  const lines = wrapText(block.text, ctx.regularFont, fontSize, textWidth);
  for (const line of lines) {
    ctx.page.drawText(line, {
      x: boxLeft + padX,
      y: ty,
      size: fontSize,
      font: ctx.regularFont,
      color: colors.text,
    });
    ty -= fontSize + lineGap;
  }

  ctx.cursorY = boxBottom - 10;
}

function drawTable(ctx, block) {
  const { headers, rows } = block;
  const colCount = headers.length;
  const cellPadX = 8;
  const cellPadY = 7;
  const fontSize = 10;
  const lineGap = 3;
  const tableWidth = usableWidth;

  const colWidths = calculateColumnWidths(ctx, headers, rows, tableWidth, fontSize, cellPadX);

  function rowHeight(cells, font) {
    let maxH = 0;
    for (let c = 0; c < colCount; c++) {
      const tw = colWidths[c] - cellPadX * 2;
      const h = measureTextHeight(cells[c] || "", font, fontSize, tw, lineGap);
      if (h > maxH) maxH = h;
    }
    return maxH + cellPadY * 2;
  }

  function drawRow(cells, font, bgColor, isHeader, rowIndex) {
    const rh = rowHeight(cells, font);
    ensureSpace(ctx, rh + 2);
    const rowTop = ctx.cursorY;
    let x = pg.marginX;

    // Background: header or zebra striping
    const effectiveBg = bgColor || (rowIndex % 2 === 1 ? colors.tableZebra : null);
    if (effectiveBg) drawRect(ctx, pg.marginX, rowTop - rh, tableWidth, rh, effectiveBg);

    // Cell text
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

    // Horizontal line only (no vertical lines)
    const lineThickness = isHeader ? 0.75 : 0.5;
    drawHLine(ctx, pg.marginX, pg.marginX + tableWidth, rowTop - rh, colors.tableGrid, lineThickness);

    ctx.cursorY = rowTop - rh;
  }

  // Header
  drawRow(headers, ctx.boldFont, colors.tableHeaderBg, true, -1);

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const rh = rowHeight(rows[i], ctx.regularFont);
    if (ctx.cursorY - rh < pg.marginBottom) {
      addNewPage(ctx);
      drawRow(headers, ctx.boldFont, colors.tableHeaderBg, true, -1);
    }
    drawRow(rows[i], ctx.regularFont, null, false, i);
  }

  ctx.cursorY -= 10;
}

function calculateColumnWidths(ctx, headers, rows, tableWidth, fontSize, cellPadX) {
  const colCount = headers.length;
  const maxWidths = new Array(colCount).fill(0);
  for (let c = 0; c < colCount; c++) {
    const hw = ctx.boldFont.widthOfTextAtSize(headers[c], fontSize) + cellPadX * 2;
    maxWidths[c] = hw;
    for (const row of rows) {
      const rw = ctx.regularFont.widthOfTextAtSize(row[c] || "", fontSize) + cellPadX * 2;
      if (rw > maxWidths[c]) maxWidths[c] = rw;
    }
  }
  const total = maxWidths.reduce((a, b) => a + b, 0);
  const widths = maxWidths.map((w) => Math.min((w / total) * tableWidth, tableWidth * 0.5));
  const sum = widths.reduce((a, b) => a + b, 0);
  const ratio = tableWidth / sum;
  return widths.map((w) => w * ratio);
}

function drawComparison(ctx, block) {
  const { bad, good } = block;
  const padX = 12;
  const padY = 8;
  const gap = 10;
  const halfWidth = (usableWidth - gap) / 2;
  const textWidth = halfWidth - padX * 2;
  const fontSize = 10;
  const labelSize = 10;

  const badLabelH = labelSize + 6;
  const goodLabelH = labelSize + 6;
  const badTextH = measureTextHeight(bad.text, ctx.regularFont, fontSize, textWidth, 4);
  const goodTextH = measureTextHeight(good.text, ctx.regularFont, fontSize, textWidth, 4);
  const boxH = Math.max(badLabelH + badTextH, goodLabelH + goodTextH) + padY * 2 + 4;

  ensureSpace(ctx, boxH + 8);
  const boxTop = ctx.cursorY + 8;
  const leftX = pg.marginX;
  const rightX = pg.marginX + halfWidth + gap;

  // Bad box - rounded rect
  drawRoundedRect(ctx.page, leftX, boxTop - boxH, halfWidth, boxH, 6, {
    fill: colors.comparisonBad,
  });
  ctx.page.drawText(bad.label || "Bad", {
    x: leftX + padX,
    y: boxTop - padY - labelSize,
    size: labelSize,
    font: ctx.boldFont,
    color: colors.comparisonBadAccent,
  });
  const badLines = wrapText(bad.text, ctx.regularFont, fontSize, textWidth);
  let by = boxTop - padY - badLabelH - fontSize;
  for (const line of badLines) {
    ctx.page.drawText(line, { x: leftX + padX, y: by, size: fontSize, font: ctx.regularFont, color: colors.text });
    by -= fontSize + 4;
  }

  // Good box - rounded rect
  drawRoundedRect(ctx.page, rightX, boxTop - boxH, halfWidth, boxH, 6, {
    fill: colors.comparisonGood,
  });
  ctx.page.drawText(good.label || "Good", {
    x: rightX + padX,
    y: boxTop - padY - labelSize,
    size: labelSize,
    font: ctx.boldFont,
    color: colors.comparisonGoodAccent,
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
    size: 12,
    gapAfter: 2,
    indent: 4,
  });
  drawTextLine(ctx, block.explanation, {
    size: 10.5,
    indent: 20,
    gapAfter: 8,
  });
}

function drawScenario(ctx, block) {
  const padX = 14;
  const padY = 14;
  const boxWidth = usableWidth;
  const textWidth = boxWidth - padX * 2;
  const fontSize = 10;
  const labelSize = 10;
  const lineGap = 4;

  let contentH = 0;
  if (block.title) contentH += 13 + 10; // 13pt bold title
  const labelPairs = [];
  if (block.situation) labelPairs.push(["상황", block.situation]);
  if (block.action) labelPairs.push(["조치", block.action]);
  if (block.result) labelPairs.push(["결과", block.result]);

  for (const [, text] of labelPairs) {
    contentH += labelSize + 4;
    contentH += measureTextHeight(text, ctx.regularFont, fontSize, textWidth - 40, lineGap);
    contentH += 4;
  }
  const boxH = contentH + padY * 2 + 4;

  ensureSpace(ctx, boxH + 8);
  const boxTop = ctx.cursorY + 8;
  const boxLeft = pg.marginX;
  const boxBottom = boxTop - boxH;

  // Rounded rectangle background + border
  drawRoundedRect(ctx.page, boxLeft, boxBottom, boxWidth, boxH, 8, {
    fill: colors.scenarioBg,
    stroke: colors.scenarioBorder,
    strokeWidth: 0.75,
  });

  let ty = boxTop - padY;

  // Title
  if (block.title) {
    ty -= 13;
    ctx.page.drawText(block.title, {
      x: boxLeft + padX,
      y: ty,
      size: 13,
      font: ctx.boldFont,
      color: colors.heading,
    });
    ty -= 10;
  }

  // Label rows
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

  ctx.cursorY = boxBottom - 10;
}

function drawDivider(ctx) {
  ensureSpace(ctx, 24);
  ctx.cursorY -= 12;
  drawHLine(ctx, pg.marginX, pg.marginX + usableWidth, ctx.cursorY, colors.divider, 0.5);
  ctx.cursorY -= 12;
}

function drawImage(ctx, block) {
  const image = ctx.images && ctx.images.get(block.src);
  if (!image) return;

  const widthRatio = block.width || 0.8;
  const drawWidth = widthRatio <= 1 ? usableWidth * widthRatio : widthRatio;
  const imgDims = image.scale(1);
  const aspectRatio = imgDims.height / imgDims.width;
  let drawHeight = drawWidth * aspectRatio;

  const maxHeight = (pg.height - pg.marginTop - pg.marginBottom) * 0.6;
  if (drawHeight > maxHeight) {
    drawHeight = maxHeight;
  }

  const captionHeight = block.caption ? 20 : 0;
  const totalHeight = drawHeight + captionHeight + 10;

  ensureSpace(ctx, totalHeight);

  const x = pg.marginX + (usableWidth - drawWidth) / 2;
  const y = ctx.cursorY - drawHeight;

  ctx.page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
  ctx.cursorY = y - 4;

  if (block.caption) {
    const captionWidth = ctx.regularFont.widthOfTextAtSize(block.caption, 9);
    const captionX = pg.marginX + (usableWidth - captionWidth) / 2;
    ctx.page.drawText(block.caption, {
      x: captionX,
      y: ctx.cursorY,
      size: 9,
      font: ctx.regularFont,
      color: colors.meta,
    });
    ctx.cursorY -= 16;
  }

  ctx.cursorY -= 6;
}

function drawGlossary(ctx, glossary) {
  if (!glossary || glossary.length === 0) return;

  ensureSpace(ctx, 40);
  drawTextLine(ctx, "용어 사전 (Glossary)", {
    font: ctx.boldFont,
    size: 20,
    color: colors.sectionTitle,
    gapAfter: 18,
  });

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
    case "image":
      drawImage(ctx, block);
      break;
    default:
      if (block.text) drawParagraph(ctx, block);
      break;
  }
}

// ── Page numbers (cover excluded) ──────────────────────────────
function addPageNumbers(pdfDoc, font) {
  const pages = pdfDoc.getPages();
  // Skip page 0 (cover), number from page 1 onwards
  for (let i = 1; i < pages.length; i++) {
    const p = pages[i];
    const label = `${i}`;
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

// ── Cover page ─────────────────────────────────────────────────
function drawCoverPage(ctx, documentData) {
  // Cover is a clean, minimal page: title centered vertically
  const titleSize = 36;
  const subtitleSize = 16;
  const metaSize = 11;
  const centerY = pg.height * 0.52;

  // Title lines (may wrap for long titles)
  const titleLines = wrapText(documentData.title, ctx.boldFont, titleSize, usableWidth);
  let ty = centerY;
  for (const line of titleLines) {
    ctx.page.drawText(line, {
      x: pg.marginX,
      y: ty,
      size: titleSize,
      font: ctx.boldFont,
      color: colors.heading,
    });
    ty -= titleSize + 8;
  }
  ty -= 8;

  // Subtitle
  const subtitleLines = wrapText(documentData.subtitle, ctx.regularFont, subtitleSize, usableWidth);
  for (const line of subtitleLines) {
    ctx.page.drawText(line, {
      x: pg.marginX,
      y: ty,
      size: subtitleSize,
      font: ctx.regularFont,
      color: colors.subtitle,
    });
    ty -= subtitleSize + 6;
  }
  ty -= 16;

  // Thin divider line (40pt wide)
  const lineWidth = 40;
  ctx.page.drawLine({
    start: { x: pg.marginX, y: ty },
    end: { x: pg.marginX + lineWidth, y: ty },
    thickness: 0.75,
    color: colors.divider,
  });
  ty -= 20;

  // Version & date meta
  const metaText = `v${documentData.version} · ${documentData.updatedAt}`;
  ctx.page.drawText(metaText, {
    x: pg.marginX,
    y: ty,
    size: metaSize,
    font: ctx.regularFont,
    color: colors.meta,
  });

  // Start content on next page
  addNewPage(ctx);

  // Header banner image on first content page (if available)
  if (documentData.headerImage && ctx.images) {
    const image = ctx.images.get(documentData.headerImage);
    if (image) {
      const drawWidth = usableWidth;
      const imgDims = image.scale(1);
      const aspectRatio = imgDims.height / imgDims.width;
      let drawHeight = drawWidth * aspectRatio;
      const maxHeight = 180;
      if (drawHeight > maxHeight) drawHeight = maxHeight;

      ensureSpace(ctx, drawHeight + 10);
      const x = pg.marginX;
      const y = ctx.cursorY - drawHeight;
      ctx.page.drawImage(image, { x, y, width: drawWidth, height: drawHeight });
      ctx.cursorY = y - 14;
    }
  }
}

// ── Main build ─────────────────────────────────────────────────
async function buildDocument(documentData, outputName) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const regularFontBytes = fs.readFileSync(fontPath);
  const boldFontBytes = fs.readFileSync(boldFontPath);
  const regularFont = await pdfDoc.embedFont(regularFontBytes, { subset: false });
  const boldFont = await pdfDoc.embedFont(boldFontBytes, { subset: false });

  pdfDoc.setTitle(documentData.title);
  pdfDoc.setAuthor("AgentOps Classroom");
  pdfDoc.setSubject(documentData.subtitle);

  // Preload images
  const images = new Map();
  const imageSources = new Set();
  if (documentData.headerImage) imageSources.add(documentData.headerImage);
  for (const section of documentData.sections) {
    if (section.blocks) {
      for (const block of section.blocks) {
        if (block.type === "image" && block.src) imageSources.add(block.src);
      }
    }
  }
  for (const src of imageSources) {
    try {
      let imageBytes;
      if (src.startsWith("http://") || src.startsWith("https://")) {
        const resp = await fetch(src);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        imageBytes = new Uint8Array(await resp.arrayBuffer());
      } else {
        const filePath = path.join(imagesDir, src);
        if (!fs.existsSync(filePath)) {
          console.warn(`  [skip] Image not found: ${src}`);
          continue;
        }
        imageBytes = fs.readFileSync(filePath);
      }
      const lower = src.toLowerCase();
      if (lower.endsWith(".png")) {
        images.set(src, await pdfDoc.embedPng(imageBytes));
      } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
        images.set(src, await pdfDoc.embedJpg(imageBytes));
      } else {
        try {
          images.set(src, await pdfDoc.embedPng(imageBytes));
        } catch {
          images.set(src, await pdfDoc.embedJpg(imageBytes));
        }
      }
      console.log(`  [ok] Embedded image: ${src}`);
    } catch (err) {
      console.warn(`  [skip] Failed to load image "${src}": ${err.message}`);
    }
  }

  const ctx = {
    pdfDoc,
    regularFont,
    boldFont,
    images,
    page: pdfDoc.addPage([pg.width, pg.height]),
    cursorY: pg.height - pg.marginTop,
    pageCount: 1,
  };

  // Cover page instead of inline header
  drawCoverPage(ctx, documentData);

  for (const section of documentData.sections) {
    // Section title
    ensureSpace(ctx, 50);
    ctx.cursorY -= 24; // inter-section spacing
    drawTextLine(ctx, section.title, {
      font: boldFont,
      size: 20,
      color: colors.sectionTitle,
      gapAfter: 18,
    });

    if (section.blocks) {
      for (const block of section.blocks) {
        renderBlock(ctx, block);
      }
    }

    // Legacy support
    if (section.items) {
      for (const item of section.items) {
        drawTextLine(ctx, item, { bullet: "•", indent: 12 });
      }
    }
    if (section.callout && typeof section.callout === "string") {
      drawTextLine(ctx, section.callout, {
        size: 10.5,
        color: colors.subtitle,
        gapAfter: 14,
      });
    }
  }

  // Glossary
  if (documentData.glossary) {
    drawGlossary(ctx, documentData.glossary);
  }

  addPageNumbers(pdfDoc, regularFont);

  const bytes = await pdfDoc.save();
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, outputName), bytes);
}

await buildDocument(handbook, "agentops-classroom-handbook.pdf");
await buildDocument(runbook, "agentops-classroom-runbook.pdf");
