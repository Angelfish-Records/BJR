// web/app/home/player/visualizer/types.ts

// This is the *stable* contract between AudioEngine -> audioSurface -> Visualizer themes.
// Keep fields additive (never remove/rename casually) to avoid theme churn.
export type AudioFeatures = {
  // Always present (VisualizerCanvas provides a reduced-motion fallback).
  energy: number;

  // Optional but commonly provided by AudioEngine.
  rms?: number;

  // Band envelopes in 0..1 (roughly)
  bass?: number;
  mid?: number;
  treble?: number;

  // Normalized spectral centroid in 0..1
  centroid?: number;
};

export type Theme = {
  name: string;
  init(gl: WebGL2RenderingContext): void;
  render(
    gl: WebGL2RenderingContext,
    opts: {
      time: number;
      width: number;
      height: number;
      dpr: number;
      audio: AudioFeatures;
    },
  ): void;
  dispose(gl: WebGL2RenderingContext): void;
};
