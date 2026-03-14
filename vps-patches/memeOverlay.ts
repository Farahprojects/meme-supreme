/**
 * Meme text overlay — Sharp + @napi-rs/canvas.
 * Fast: local font file, libvips decode/encode, Cairo text rendering.
 * Readable: dark gradient scrims + multi-layer shadow guarantee white text pops on any bg.
 * Supports text_style: font (Poppins|Inter|Playfair|Bebas|Nunito), size (S|M|L|XL), allCaps.
 */
import sharp from "sharp";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { join } from "path";

const FONTS_DIR = join(process.cwd(), "fonts");

const FONT_FILES: Record<string, string> = {
  Poppins: "Poppins-ExtraBold.ttf",
  Inter: "Inter-Bold.woff2",
  Playfair: "PlayfairDisplay-Bold.ttf",
  Bebas: "BebasNeue-Regular.ttf",
  Nunito: "Nunito-ExtraBold.ttf",
};

const FONT_NAMES: Record<string, string> = {
  Poppins: "PoppinsExtraBold",
  Inter: "InterBold",
  Playfair: "PlayfairDisplayBold",
  Bebas: "BebasNeue",
  Nunito: "NunitoExtraBold",
};

const SIZE_MULTIPLIERS: Record<string, number> = {
  S: 0.75,
  M: 1.0,
  L: 1.4,
  XL: 1.8,
};

const registeredFonts = new Set<string>();
function ensureFont(key: string) {
  if (registeredFonts.has(key)) return;
  const file = FONT_FILES[key];
  const family = FONT_NAMES[key];
  if (!file || !family) return;
  const path = join(FONTS_DIR, file);
  GlobalFonts.registerFromPath(path, family);
  registeredFonts.add(key);
}

export interface MemeOverlayMetadata {
  names: string;
  caption?: string;
  theme?: string;
  watermark?: string;
  text_style?: {
    font?: "Poppins" | "Inter" | "Playfair" | "Bebas" | "Nunito";
    size?: "S" | "M" | "L" | "XL";
    allCaps?: boolean;
  };
}

// ─── Text wrap ───────────────────────────────────────────────────────────────
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draw text with multiple shadow passes + heavy outline — readable on any bg.
 */
function drawReadableText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number
) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.95)";
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeText(text, x, y);
  ctx.restore();

  const shadowPasses = [
    { blur: 6, ox: 0, oy: 0, alpha: 0.9 },
    { blur: 4, ox: 0, oy: 1, alpha: 0.9 },
    { blur: 4, ox: 2, oy: 2, alpha: 0.9 },
    { blur: 8, ox: 0, oy: 2, alpha: 0.7 },
  ];
  for (const s of shadowPasses) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${s.alpha})`;
    ctx.shadowBlur = s.blur;
    ctx.shadowOffsetX = s.ox;
    ctx.shadowOffsetY = s.oy;
    ctx.fillStyle = "white";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = "white";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawScrim(
  ctx: CanvasRenderingContext2D,
  width: number,
  yStart: number,
  height: number,
  dir: "down" | "up"
) {
  const grad = ctx.createLinearGradient(
    0, dir === "down" ? yStart : yStart + height,
    0, dir === "down" ? yStart + height : yStart
  );
  grad.addColorStop(0, "rgba(0,0,0,0.72)");
  grad.addColorStop(0.6, "rgba(0,0,0,0.32)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, yStart, width, height);
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  centerX: number,
  topY: number,
  lineHeight: number
): number {
  for (let i = 0; i < lines.length; i++) {
    const y = topY + i * lineHeight + lineHeight * 0.78;
    drawReadableText(ctx, lines[i], centerX, y);
  }
  return topY + lines.length * lineHeight;
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function drawMemeText(
  imageBytes: Uint8Array,
  metadata: MemeOverlayMetadata
): Promise<Uint8Array> {
  const style = metadata.text_style ?? {};
  const fontKey = style.font && FONT_FILES[style.font] ? style.font : "Poppins";
  const sizeKey = style.size && SIZE_MULTIPLIERS[style.size] !== undefined ? style.size : "M";
  const mult = SIZE_MULTIPLIERS[sizeKey];
  const allCaps = !!style.allCaps;

  ensureFont(fontKey);
  const fontFamily = FONT_NAMES[fontKey];

  const img = sharp(imageBytes);
  const { width, height } = await img.metadata();
  if (!width || !height) throw new Error("Could not read image dimensions");

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const safePad = Math.floor(width * 0.06);
  const maxWidth = width - safePad * 2;
  const centerX = width / 2;

  const baseNamesSize = Math.max(16, Math.floor(width * 0.062));
  const baseCaptionSize = Math.max(14, Math.floor(width * 0.072));
  const namesFontSize = Math.max(12, Math.floor(baseNamesSize * mult));
  const captionFontSize = Math.max(12, Math.floor(baseCaptionSize * mult));

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  if (fontKey === "Bebas" && "letterSpacing" in ctx) {
    (ctx as unknown as { letterSpacing: string }).letterSpacing = "0.06em";
  }

  let namesText = metadata.names ?? "";
  if (allCaps) namesText = namesText.toUpperCase();

  // ── NAMES (top) ────────────────────────────────────────────────────────────
  ctx.font = `${namesFontSize}px "${fontFamily}"`;
  const namesLines = wrapText(ctx, namesText, maxWidth);
  const namesLineH = namesFontSize * 1.3;
  const namesBlockH = namesLines.length * namesLineH + safePad * 2;
  const namesTopY = 0;

  drawScrim(ctx, width, namesTopY, namesBlockH, "down");
  drawTextBlock(ctx, namesLines, centerX, safePad * 0.6, namesLineH);

  // ── CAPTION (bottom) ───────────────────────────────────────────────────────
  const paddingBottom = Math.floor(height * 0.055);
  const bottomMostElementY = height - paddingBottom;

  let captionLines: string[] = [];
  let captionLineH = 0;
  let captionFinalSize = captionFontSize;
  let captionTopY = bottomMostElementY;
  const gapAboveBottom = Math.floor(height * 0.02);

  if (metadata.caption?.trim()) {
    let caption = metadata.caption.trim();
    if (allCaps) caption = caption.toUpperCase();
    let fontSize = captionFontSize;
    const minFont = Math.max(12, Math.floor(width * 0.038));
    const maxBlockH = Math.floor(height * 0.28);

    let fits = false;
    while (!fits) {
      ctx.font = `${fontSize}px "${fontFamily}"`;
      captionLines = wrapText(ctx, caption, maxWidth);
      captionLineH = fontSize * 1.3;
      fits = captionLines.length * captionLineH <= maxBlockH || fontSize <= minFont;
      if (!fits) fontSize = Math.max(minFont, fontSize - 2);
    }
    captionFinalSize = fontSize;

    const captionBlockH = captionLines.length * captionLineH;
    captionTopY = Math.max(safePad, bottomMostElementY - gapAboveBottom - captionBlockH);
  }

  const bottomScrimTop = Math.max(0, captionTopY - safePad);
  drawScrim(ctx, width, bottomScrimTop, height - bottomScrimTop, "up");

  if (captionLines.length > 0) {
    ctx.font = `${captionFinalSize}px "${fontFamily}"`;
    drawTextBlock(ctx, captionLines, centerX, captionTopY, captionLineH);
  }

  // ── ICON (top left) ────────────────────────────────────────────────────────
  let logoComposite: sharp.OverlayOptions | null = null;
  try {
    const logoPath = join(process.cwd(), "assets/logo.png");
    const logoHeight = Math.max(16, Math.floor(width * 0.04));
    const logoBuffer = await sharp(logoPath).resize({ height: logoHeight }).toBuffer();
    logoComposite = {
      input: logoBuffer,
      top: safePad,
      left: safePad,
      blend: "over"
    };
  } catch {
    // Ignore if missing
  }

  const overlayPng = canvas.toBuffer("image/png");
  const composites: sharp.OverlayOptions[] = [{ input: overlayPng, blend: "over" }];
  if (logoComposite) {
    composites.push(logoComposite);
  }

  const result = await sharp(imageBytes)
    .composite(composites)
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();

  return new Uint8Array(result);
}
