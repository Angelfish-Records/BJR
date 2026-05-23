import type { CameraFrameState } from "./cinematicTypes";
import type { PostProcessStyle } from "./postStyles";

function clamp255(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function seededNoise(frameIndex: number, pixelIndex: number): number {
  const x = Math.sin(frameIndex * 12.9898 + pixelIndex * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export class FramePostProcessor {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bloomCanvas: HTMLCanvasElement;
  private readonly bloomCtx: CanvasRenderingContext2D;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly style: PostProcessStyle,
  ) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;

    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas2D unavailable for post processing");
    this.ctx = ctx;

    this.bloomCanvas = document.createElement("canvas");
    this.bloomCanvas.width = width;
    this.bloomCanvas.height = height;

    const bloomCtx = this.bloomCanvas.getContext("2d", { alpha: true });
    if (!bloomCtx) throw new Error("Canvas2D unavailable for bloom processing");
    this.bloomCtx = bloomCtx;
  }

  processIntoRgbaBuffer(
    buffer: Uint8Array,
    frameIndex: number,
    camera?: CameraFrameState,
  ): void {
    const imageData = new Uint8ClampedArray(buffer.length);
    imageData.set(buffer);

    const image = new ImageData(imageData, this.width, this.height);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.putImageData(image, 0, 0);

    this.applyCamera(camera, frameIndex);
    this.applyBloom();
    this.applyPixelGrade(frameIndex, camera);

    const out = this.ctx.getImageData(0, 0, this.width, this.height);
    buffer.set(out.data);
  }

  private applyCamera(
    camera: CameraFrameState | undefined,
    frameIndex: number,
  ): void {
    if (!camera) return;

    const zoom = camera.zoom;
    const rotation = camera.rotationRad;
    const shakePx = camera.shake;
    const shakeX = Math.sin(frameIndex * 2.17) * shakePx;
    const shakeY = Math.cos(frameIndex * 1.91) * shakePx;
    const offsetX = camera.offsetX * this.width + shakeX;
    const offsetY = camera.offsetY * this.height + shakeY;

    const scratch = this.ctx.getImageData(0, 0, this.width, this.height);

    this.bloomCtx.clearRect(0, 0, this.width, this.height);
    this.bloomCtx.putImageData(scratch, 0, 0);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    this.ctx.translate(this.width / 2 + offsetX, this.height / 2 + offsetY);
    this.ctx.rotate(rotation);
    this.ctx.scale(zoom, zoom);
    this.ctx.translate(-this.width / 2, -this.height / 2);
    this.ctx.drawImage(this.bloomCanvas, 0, 0);
    this.ctx.restore();
  }

  private applyBloom(): void {
    if (this.style.bloomStrength <= 0) return;

    const source = this.ctx.getImageData(0, 0, this.width, this.height);
    const bloom = this.bloomCtx.createImageData(this.width, this.height);
    const threshold = this.style.bloomThreshold * 255;

    for (let i = 0; i < source.data.length; i += 4) {
      const r = source.data[i] ?? 0;
      const g = source.data[i + 1] ?? 0;
      const b = source.data[i + 2] ?? 0;
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const amount = Math.max(0, (luminance - threshold) / (255 - threshold));

      bloom.data[i] = clamp255(r * amount);
      bloom.data[i + 1] = clamp255(g * amount);
      bloom.data[i + 2] = clamp255(b * amount);
      bloom.data[i + 3] = clamp255(255 * amount);
    }

    this.bloomCtx.clearRect(0, 0, this.width, this.height);
    this.bloomCtx.putImageData(bloom, 0, 0);

    this.ctx.save();
    this.ctx.globalAlpha = this.style.bloomStrength;
    this.ctx.globalCompositeOperation = "screen";
    this.ctx.filter = `blur(${this.style.bloomBlurPx}px)`;
    this.ctx.drawImage(this.bloomCanvas, 0, 0);
    this.ctx.restore();
  }

  private applyPixelGrade(frameIndex: number, camera?: CameraFrameState): void {
    const image = this.ctx.getImageData(0, 0, this.width, this.height);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);

    for (let i = 0; i < image.data.length; i += 4) {
      const pixel = i / 4;
      const x = pixel % this.width;
      const y = Math.floor(pixel / this.width);

      const exposure = this.style.exposure * (camera?.exposure ?? 1);

      let r = (image.data[i] ?? 0) * exposure;
      let g = (image.data[i + 1] ?? 0) * exposure;
      let b = (image.data[i + 2] ?? 0) * exposure;

      r = (r - 128) * this.style.contrast + 128;
      g = (g - 128) * this.style.contrast + 128;
      b = (b - 128) * this.style.contrast + 128;

      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      r = luma + (r - luma) * this.style.saturation;
      g = luma + (g - luma) * this.style.saturation;
      b = luma + (b - luma) * this.style.saturation;

      if (this.style.vignette > 0) {
        const dx = x - cx;
        const dy = y - cy;
        const dist01 = Math.sqrt(dx * dx + dy * dy) / maxDist;
        const vignetteAmount = 1 - Math.pow(dist01, 1.8) * this.style.vignette;
        r *= vignetteAmount;
        g *= vignetteAmount;
        b *= vignetteAmount;
      }

      if (this.style.grain > 0) {
        const n =
          (seededNoise(frameIndex, pixel) - 0.5) * 255 * this.style.grain;
        r += n;
        g += n;
        b += n;
      }

      image.data[i] = clamp255(r);
      image.data[i + 1] = clamp255(g);
      image.data[i + 2] = clamp255(b);
      image.data[i + 3] = 255;
    }

    this.ctx.putImageData(image, 0, 0);
  }
}
