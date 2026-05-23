import type { LyricFrameState } from "./lyricTypes";

export type LyricTextStyle = {
  fontFamily: string;
  fontSizePx: number;
  fontWeight: number;
  letterSpacingPx: number;
  lineHeight: number;
  maxWidth01: number;
  align: "left" | "center" | "right";
  anchorX01: number;
  anchorY01: number;
  fill: string;
  stroke?: string;
  strokeWidthPx?: number;
  shadowBlurPx?: number;
  shadowColor?: string;
  opacity: number;

  previousGhostOpacity: number;
  nextEchoOpacity: number;

  trailDecay: number;
  trailOpacity: number;
  trailBlurPx: number;

  lineStartScaleImpulse: number;
  lineStartBlurPx: number;
  lineStartShakePx: number;

  revealMode: "none" | "line-wipe";
  backgroundVeilOpacity: number;
  backgroundVeilRadiusPx: number;
};

const DEFAULT_STYLE: LyricTextStyle = {
  fontFamily:
    "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  fontSizePx: 42,
  fontWeight: 700,
  letterSpacingPx: 0,
  lineHeight: 1.18,
  maxWidth01: 0.76,
  align: "center",
  anchorX01: 0.5,
  anchorY01: 0.74,
  fill: "rgba(255,255,255,0.94)",
  stroke: "rgba(0,0,0,0.48)",
  strokeWidthPx: 5,
  shadowBlurPx: 22,
  shadowColor: "rgba(255,255,255,0.28)",
  opacity: 1,

  previousGhostOpacity: 0.18,
  nextEchoOpacity: 0.08,

  trailDecay: 0.88,
  trailOpacity: 0.34,
  trailBlurPx: 1.2,

  lineStartScaleImpulse: 0.04,
  lineStartBlurPx: 1.8,
  lineStartShakePx: 1.8,

  revealMode: "line-wipe",
  backgroundVeilOpacity: 0.14,
  backgroundVeilRadiusPx: 18,
};

type TextLayerInput = {
  text: string;
  opacity: number;
  yOffsetPx: number;
  scale: number;
  blurPx: number;
  progress01?: number;
  shakePx?: number;
};

type TextBlock = {
  lines: string[];
  font: string;
  fontSizePx: number;
  lineHeightPx: number;
  anchorX: number;
  startY: number;
  blockWidth: number;
  blockHeight: number;
};

type LetterSpacingCapableContext = CanvasRenderingContext2D & {
  letterSpacing?: string;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number): number {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutSine(value: number): number {
  const t = clamp01(value);
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function lyricOpacity(lyric: LyricFrameState): number {
  if (!lyric.activeText) return 0;

  const fadeIn = easeOutCubic(lyric.lineAgeSec / 0.22);
  const fadeOut = lyric.isLineEnd
    ? Math.max(0.35, 1 - lyric.lineProgress01)
    : 1;

  return clamp01(fadeIn * fadeOut);
}

function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function makeCanvas(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", {
    alpha: true,
    willReadFrequently: true,
  });

  if (!ctx) {
    throw new Error("Canvas2D is unavailable for lyric text rendering");
  }

  return { canvas, ctx };
}

export class LyricTextRenderer {
  private readonly frameCanvas: HTMLCanvasElement;
  private readonly frameCtx: CanvasRenderingContext2D;
  private readonly layerCanvas: HTMLCanvasElement;
  private readonly layerCtx: CanvasRenderingContext2D;
  private readonly trailCanvas: HTMLCanvasElement;
  private readonly trailCtx: CanvasRenderingContext2D;
  private readonly trailScratchCanvas: HTMLCanvasElement;
  private readonly trailScratchCtx: CanvasRenderingContext2D;
  private readonly style: LyricTextStyle;

  constructor(
    private readonly width: number,
    private readonly height: number,
    style?: Partial<LyricTextStyle>,
  ) {
    const frame = makeCanvas(width, height);
    const layer = makeCanvas(width, height);
    const trail = makeCanvas(width, height);
    const trailScratch = makeCanvas(width, height);

    this.frameCanvas = frame.canvas;
    this.frameCtx = frame.ctx;
    this.layerCanvas = layer.canvas;
    this.layerCtx = layer.ctx;
    this.trailCanvas = trail.canvas;
    this.trailCtx = trail.ctx;
    this.trailScratchCanvas = trailScratch.canvas;
    this.trailScratchCtx = trailScratch.ctx;

    this.style = {
      ...DEFAULT_STYLE,
      ...style,
    };
  }

  compositeIntoRgbaBuffer(buffer: Uint8Array, lyric: LyricFrameState): void {
    const activeOpacity = lyricOpacity(lyric) * this.style.opacity;
    const activeText = lyric.activeText?.trim();

    const hasActive = Boolean(activeText && activeOpacity > 0);
    const hasPrevious = Boolean(lyric.previousText?.trim());
    const hasNext = Boolean(lyric.nextText?.trim());

    this.updateTrailLayer();

    if (
      !hasActive &&
      !hasPrevious &&
      !hasNext &&
      this.style.trailOpacity <= 0
    ) {
      return;
    }

    const imageData = new Uint8ClampedArray(buffer.length);
    imageData.set(buffer);

    const image = new ImageData(imageData, this.width, this.height);

    this.frameCtx.clearRect(0, 0, this.width, this.height);
    this.frameCtx.putImageData(image, 0, 0);

    this.layerCtx.clearRect(0, 0, this.width, this.height);

    if (lyric.previousText?.trim()) {
      this.drawTextLayer(this.layerCtx, {
        text: lyric.previousText,
        opacity:
          this.style.previousGhostOpacity *
          this.style.opacity *
          clamp01(1 - lyric.lineProgress01 * 0.72),
        yOffsetPx: -this.style.fontSizePx * 1.25,
        scale: 0.92,
        blurPx: 1.6,
      });
    }

    if (activeText && activeOpacity > 0) {
      const impulse01 = lyric.isLineStart
        ? clamp01(1 - lyric.lineAgeSec / 0.18)
        : 0;

      const shakePhase = lyric.lineAgeSec * 90;
      const shakePx =
        Math.sin(shakePhase) * this.style.lineStartShakePx * impulse01;

      this.drawTextLayer(this.layerCtx, {
        text: activeText,
        opacity: activeOpacity,
        yOffsetPx: 0,
        scale: 1 + impulse01 * this.style.lineStartScaleImpulse,
        blurPx: impulse01 * this.style.lineStartBlurPx,
        progress01:
          this.style.revealMode === "line-wipe"
            ? easeInOutSine(Math.min(1, lyric.lineAgeSec / 0.5))
            : undefined,
        shakePx,
      });
    }

    if (lyric.nextText?.trim() && lyric.timeToNextLineSec !== null) {
      const echoWindow01 = clamp01(1 - lyric.timeToNextLineSec / 1.4);

      this.drawTextLayer(this.layerCtx, {
        text: lyric.nextText,
        opacity: this.style.nextEchoOpacity * this.style.opacity * echoWindow01,
        yOffsetPx: this.style.fontSizePx * 1.35,
        scale: 0.9,
        blurPx: 2.4,
      });
    }

    this.addCurrentLayerToTrail();
    this.compositeTrailAndCurrent();

    const composited = this.frameCtx.getImageData(
      0,
      0,
      this.width,
      this.height,
    );
    buffer.set(composited.data);
  }

  private updateTrailLayer(): void {
    const decay = clamp01(this.style.trailDecay);

    this.trailScratchCtx.clearRect(0, 0, this.width, this.height);
    this.trailScratchCtx.save();
    this.trailScratchCtx.globalAlpha = decay;

    if (this.style.trailBlurPx > 0) {
      this.trailScratchCtx.filter = `blur(${this.style.trailBlurPx}px)`;
    }

    this.trailScratchCtx.drawImage(this.trailCanvas, 0, 0);
    this.trailScratchCtx.restore();

    this.trailCtx.clearRect(0, 0, this.width, this.height);
    this.trailCtx.drawImage(this.trailScratchCanvas, 0, 0);
  }

  private addCurrentLayerToTrail(): void {
    this.trailCtx.save();
    this.trailCtx.globalAlpha = 0.72;
    this.trailCtx.drawImage(this.layerCanvas, 0, 0);
    this.trailCtx.restore();
  }

  private compositeTrailAndCurrent(): void {
    if (this.style.trailOpacity > 0) {
      this.frameCtx.save();
      this.frameCtx.globalAlpha = clamp01(this.style.trailOpacity);
      this.frameCtx.drawImage(this.trailCanvas, 0, 0);
      this.frameCtx.restore();
    }

    this.frameCtx.drawImage(this.layerCanvas, 0, 0);
  }

  private drawTextLayer(
    ctx: CanvasRenderingContext2D,
    input: TextLayerInput,
  ): void {
    const { text, opacity, yOffsetPx, scale, blurPx, progress01, shakePx } =
      input;

    if (opacity <= 0) return;

    const block = this.measureTextBlock(text, yOffsetPx, scale);
    const revealProgress = progress01 ?? 1;

    ctx.save();

    if (blurPx > 0) {
      ctx.filter = `blur(${blurPx}px)`;
    }

    if (this.style.backgroundVeilOpacity > 0) {
      this.drawBackgroundVeil(ctx, block, opacity, revealProgress);
    }

    ctx.globalAlpha = opacity;
    ctx.font = block.font;
    ctx.textAlign = this.style.align;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = this.style.fill;

    this.applyLetterSpacing(ctx, this.style.letterSpacingPx);

    if (this.style.shadowBlurPx && this.style.shadowColor) {
      ctx.shadowBlur = this.style.shadowBlurPx;
      ctx.shadowColor = this.style.shadowColor;
    }

    if (revealProgress < 1) {
      const clipWidth = block.blockWidth * clamp01(revealProgress);
      const clipX = this.clipX(block.anchorX, block.blockWidth);

      ctx.beginPath();
      ctx.rect(
        clipX,
        block.startY - block.lineHeightPx,
        clipWidth,
        block.blockHeight + block.lineHeightPx,
      );
      ctx.clip();
    }

    for (let i = 0; i < block.lines.length; i += 1) {
      const line = block.lines[i];
      if (!line) continue;

      const y = block.startY + i * block.lineHeightPx;
      const x = block.anchorX + (shakePx ?? 0);

      if (
        this.style.stroke &&
        this.style.strokeWidthPx &&
        this.style.strokeWidthPx > 0
      ) {
        ctx.strokeStyle = this.style.stroke;
        ctx.lineWidth = this.style.strokeWidthPx;
        ctx.lineJoin = "round";
        ctx.strokeText(line, x, y);
      }

      ctx.fillText(line, x, y);
    }

    ctx.restore();
  }

  private drawBackgroundVeil(
    ctx: CanvasRenderingContext2D,
    block: TextBlock,
    opacity: number,
    revealProgress: number,
  ): void {
    const padX = this.style.fontSizePx * 0.55;
    const padY = this.style.fontSizePx * 0.35;
    const fullWidth = block.blockWidth + padX * 2;
    const visibleWidth = fullWidth * clamp01(revealProgress);
    const x = this.clipX(block.anchorX, fullWidth);
    const y = block.startY - block.lineHeightPx - padY * 0.35;
    const h = block.blockHeight + padY * 1.6;

    ctx.save();
    ctx.globalAlpha = this.style.backgroundVeilOpacity * opacity;
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    this.roundRect(
      ctx,
      x,
      y,
      visibleWidth,
      h,
      this.style.backgroundVeilRadiusPx,
    );
    ctx.fill();
    ctx.restore();
  }

  private measureTextBlock(
    text: string,
    yOffsetPx: number,
    scale: number,
  ): TextBlock {
    const fontSizePx = this.style.fontSizePx * scale;
    const font = `${this.style.fontWeight} ${fontSizePx}px ${this.style.fontFamily}`;
    const maxWidth = this.width * this.style.maxWidth01;
    const lines = this.wrapText(text, maxWidth, font);

    this.frameCtx.font = font;
    this.applyLetterSpacing(this.frameCtx, this.style.letterSpacingPx);

    const blockWidth = lines.reduce((max, line) => {
      const measured = this.frameCtx.measureText(line).width;
      return Math.max(max, measured);
    }, 0);

    const lineHeightPx = fontSizePx * this.style.lineHeight;
    const blockHeight = lines.length * lineHeightPx;
    const anchorX = this.width * this.style.anchorX01;
    const anchorY = this.height * this.style.anchorY01 + yOffsetPx;
    const startY = anchorY - blockHeight / 2 + lineHeightPx * 0.72;

    return {
      lines,
      font,
      fontSizePx,
      lineHeightPx,
      anchorX,
      startY,
      blockWidth,
      blockHeight,
    };
  }

  private wrapText(text: string, maxWidth: number, font: string): string[] {
    const words = splitWords(text);
    const lines: string[] = [];
    let current = "";

    this.frameCtx.font = font;
    this.applyLetterSpacing(this.frameCtx, this.style.letterSpacingPx);

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const measured = this.frameCtx.measureText(candidate);

      if (measured.width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }

    if (current) lines.push(current);

    return lines;
  }

  private applyLetterSpacing(
    ctx: CanvasRenderingContext2D,
    letterSpacingPx: number,
  ): void {
    const letterSpacingCtx = ctx as LetterSpacingCapableContext;
    if ("letterSpacing" in letterSpacingCtx) {
      letterSpacingCtx.letterSpacing = `${letterSpacingPx}px`;
    }
  }

  private clipX(anchorX: number, fullWidth: number): number {
    if (this.style.align === "left") return anchorX;
    if (this.style.align === "right") return anchorX - fullWidth;
    return anchorX - fullWidth / 2;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    const r = Math.min(radius, width / 2, height / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
