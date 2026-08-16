// web/app/home/player/visualizer/offline/PromoImageRenderer.ts

export type PromoImageOverlayConfig = {
  iconUrl?: string;
  artworkUrl?: string;
  startSec?: number;
  endSec?: number;
};

type ImagePlacement = {
  centerX01: number;
  centerY01: number;
  maxWidth01: number;
  maxHeight01: number;
  cornerRadiusPx: number;
  shadowBlurPx: number;
  shadowColor: string;
  backdropOpacity: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function makeCanvas(
  width: number,
  height: number,
  alpha: boolean,
): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", {
    alpha,
    willReadFrequently: true,
  });

  if (!ctx) {
    throw new Error("Canvas2D is unavailable for promo image rendering");
  }

  return { canvas, ctx };
}

function loadImage(url: string, label: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";

    image.onload = () => resolve(image);
    image.onerror = () => {
      reject(new Error(`Failed to load ${label}: ${url}`));
    };

    image.src = url;
  });
}

function imageDimensions(image: HTMLImageElement): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(1, image.naturalWidth || image.width || 1),
    height: Math.max(1, image.naturalHeight || image.height || 1),
  };
}

function fitWithin(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): {
  width: number;
  height: number;
} {
  const scale = Math.min(
    maxWidth / Math.max(1, sourceWidth),
    maxHeight / Math.max(1, sourceHeight),
  );

  return {
    width: Math.max(1, sourceWidth * scale),
    height: Math.max(1, sourceHeight * scale),
  };
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));

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

export class PromoImageRenderer {
  private readonly frameCanvas: HTMLCanvasElement;
  private readonly frameCtx: CanvasRenderingContext2D;
  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly overlayCtx: CanvasRenderingContext2D;

  private constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly config: PromoImageOverlayConfig,
    private readonly iconImage: HTMLImageElement | null,
    private readonly artworkImage: HTMLImageElement | null,
  ) {
    const frame = makeCanvas(width, height, false);
    const overlay = makeCanvas(width, height, true);

    this.frameCanvas = frame.canvas;
    this.frameCtx = frame.ctx;
    this.overlayCanvas = overlay.canvas;
    this.overlayCtx = overlay.ctx;

    this.renderStaticOverlay();
  }

  static async create(
    width: number,
    height: number,
    config: PromoImageOverlayConfig,
  ): Promise<PromoImageRenderer> {
    const [iconImage, artworkImage] = await Promise.all([
      config.iconUrl ? loadImage(config.iconUrl, "promo icon") : null,
      config.artworkUrl ? loadImage(config.artworkUrl, "promo artwork") : null,
    ]);

    return new PromoImageRenderer(
      width,
      height,
      config,
      iconImage,
      artworkImage,
    );
  }

  compositeIntoRgbaBuffer(buffer: Uint8Array, timeSec: number): void {
    if (!this.iconImage && !this.artworkImage) return;

    const opacity = this.opacityAtTime(timeSec);
    if (opacity <= 0) return;

    const imageData = new Uint8ClampedArray(buffer.length);
    imageData.set(buffer);

    this.frameCtx.clearRect(0, 0, this.width, this.height);
    this.frameCtx.putImageData(
      new ImageData(imageData, this.width, this.height),
      0,
      0,
    );

    this.frameCtx.save();
    this.frameCtx.globalAlpha = opacity;
    this.frameCtx.drawImage(this.overlayCanvas, 0, 0);
    this.frameCtx.restore();

    const composited = this.frameCtx.getImageData(
      0,
      0,
      this.width,
      this.height,
    );
    buffer.set(composited.data);
  }

  dispose(): void {
    this.frameCtx.clearRect(0, 0, this.width, this.height);
    this.overlayCtx.clearRect(0, 0, this.width, this.height);
  }

  private opacityAtTime(timeSec: number): number {
    const startSec = this.config.startSec;
    const endSec = this.config.endSec;

    if (startSec !== undefined && timeSec < startSec) return 0;
    if (endSec !== undefined && timeSec >= endSec) return 0;

    const fadeSec = 0.28;
    let opacity = 1;

    if (startSec !== undefined) {
      opacity = Math.min(opacity, clamp01((timeSec - startSec) / fadeSec));
    }

    if (endSec !== undefined) {
      opacity = Math.min(opacity, clamp01((endSec - timeSec) / fadeSec));
    }

    return opacity;
  }

  private renderStaticOverlay(): void {
    this.overlayCtx.clearRect(0, 0, this.width, this.height);

    const portrait = this.height > this.width * 1.15;

    if (this.iconImage) {
      this.drawContainedImage(this.iconImage, {
        centerX01: 0.5,
        centerY01: portrait ? 0.245 : 0.22,
        maxWidth01: portrait ? 0.14 : 0.1,
        maxHeight01: portrait ? 0.08 : 0.14,
        cornerRadiusPx: 0,
        shadowBlurPx: this.width * 0.022,
        shadowColor: "rgba(0,0,0,0.62)",
        backdropOpacity: 0,
      });
    }

    if (this.artworkImage) {
      this.drawContainedImage(this.artworkImage, {
        centerX01: 0.5,
        centerY01: portrait ? 0.72 : 0.76,
        maxWidth01: portrait ? 0.44 : 0.24,
        maxHeight01: portrait ? 0.25 : 0.34,
        cornerRadiusPx: this.width * 0.018,
        shadowBlurPx: this.width * 0.035,
        shadowColor: "rgba(0,0,0,0.72)",
        backdropOpacity: 0.22,
      });
    }
  }

  private drawContainedImage(
    image: HTMLImageElement,
    placement: ImagePlacement,
  ): void {
    const source = imageDimensions(image);
    const fitted = fitWithin(
      source.width,
      source.height,
      this.width * placement.maxWidth01,
      this.height * placement.maxHeight01,
    );

    const x = this.width * placement.centerX01 - fitted.width / 2;
    const y = this.height * placement.centerY01 - fitted.height / 2;

    if (placement.cornerRadiusPx > 0) {
      this.overlayCtx.save();
      this.overlayCtx.shadowBlur = placement.shadowBlurPx;
      this.overlayCtx.shadowColor = placement.shadowColor;
      this.overlayCtx.fillStyle = `rgba(0,0,0,${placement.backdropOpacity})`;
      roundedRectPath(
        this.overlayCtx,
        x,
        y,
        fitted.width,
        fitted.height,
        placement.cornerRadiusPx,
      );
      this.overlayCtx.fill();
      this.overlayCtx.restore();

      this.overlayCtx.save();
      roundedRectPath(
        this.overlayCtx,
        x,
        y,
        fitted.width,
        fitted.height,
        placement.cornerRadiusPx,
      );
      this.overlayCtx.clip();
      this.overlayCtx.drawImage(
        image,
        x,
        y,
        fitted.width,
        fitted.height,
      );
      this.overlayCtx.restore();
      return;
    }

    this.overlayCtx.save();
    this.overlayCtx.shadowBlur = placement.shadowBlurPx;
    this.overlayCtx.shadowColor = placement.shadowColor;
    this.overlayCtx.drawImage(
      image,
      x,
      y,
      fitted.width,
      fitted.height,
    );
    this.overlayCtx.restore();
  }
}
