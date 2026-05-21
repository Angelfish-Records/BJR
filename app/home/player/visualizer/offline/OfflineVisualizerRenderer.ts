// web/app/home/player/visualizer/offline/OfflineVisualizerRenderer.ts

import { loadThemeFactory } from "../core/themeRegistry";
import { VisualizerFrameRenderer } from "../core/VisualizerFrameRenderer";
import type { Theme } from "../types";
import type { AudioFeatureFrame, OfflineRenderConfig } from "./offlineTypes";

export class OfflineVisualizerRenderer {
  private frameRenderer: VisualizerFrameRenderer | null = null;
  private theme: Theme | null = null;
  private nextFrameIndex = 0;
  private disposed = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly config: OfflineRenderConfig,
  ) {}

  async init(): Promise<void> {
    if (this.disposed) {
      throw new Error("OfflineVisualizerRenderer has been disposed");
    }

    const factory = await loadThemeFactory(this.config.themeName);
    const theme = factory();

    theme.init(this.gl);

    this.theme = theme;
    this.frameRenderer = new VisualizerFrameRenderer({
      gl: this.gl,
      width: this.config.width,
      height: this.config.height,
      dpr: 1,
      mode: "offline",
    });
  }

  renderFrame(frame: AudioFeatureFrame): void {
    if (this.disposed) {
      throw new Error("OfflineVisualizerRenderer has been disposed");
    }

    if (!this.theme || !this.frameRenderer) {
      throw new Error("OfflineVisualizerRenderer has not been initialized");
    }

    if (frame.frameIndex !== this.nextFrameIndex) {
      throw new Error(
        `Offline frames must be rendered sequentially: expected frame ${this.nextFrameIndex}, got ${frame.frameIndex}`,
      );
    }

    this.frameRenderer.clear(0, 0, 0, 1);

    this.frameRenderer.renderFrame({
      theme: this.theme,
      time: frame.time,
      frameIndex: frame.frameIndex,
      audio: frame,
      seed: this.config.seed,
      presentToScreen: false,
    });

    this.nextFrameIndex += 1;
  }

  readPixelsInto(target: Uint8Array): void {
    if (!this.frameRenderer) {
      throw new Error("OfflineVisualizerRenderer has not been initialized");
    }

    this.frameRenderer.readPixelsInto(target);
  }

  dispose(): void {
    if (this.disposed) return;

    if (this.theme) {
      this.theme.dispose(this.gl);
      this.theme = null;
    }

    this.frameRenderer?.dispose();
    this.frameRenderer = null;

    this.disposed = true;
  }
}
