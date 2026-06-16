// web/app/home/player/visualizer/offline/cinematicTimeline.ts
import type { AudioFeatureFrame } from "./offlineTypes";
import type { CameraFrameState } from "./cinematicTypes";
import type { LyricFrameState } from "./lyricTypes";

export function bakeCameraFrameStates(input: {
  audioFrames: AudioFeatureFrame[];
  lyricFrames: LyricFrameState[] | null;
  seed: number;
}): CameraFrameState[] {
  const { audioFrames, lyricFrames, seed } = input;

  return audioFrames.map((audio): CameraFrameState => {
    const lyric = lyricFrames?.[audio.frameIndex];
    const t = audio.time;

    const bass = audio.bass ?? 0;
    const energy = audio.energy ?? 0;
    const lineStart = lyric?.isLineStart ? Math.max(0, 1 - lyric.lineAgeSec / 0.18) : 0;
    const silence = lyric?.silence01 ?? 0;

    const driftX = Math.sin(t * 0.071 + seed * 0.13) * 0.012;
    const driftY = Math.cos(t * 0.053 + seed * 0.19) * 0.01;
    const rotation = Math.sin(t * 0.041 + seed * 0.07) * 0.012;

    return {
      zoom: 1.025 + bass * 0.018 + lineStart * 0.022 - silence * 0.012,
      rotationRad: rotation + lineStart * 0.008,
      offsetX: driftX + Math.sin(t * 23.1) * lineStart * 0.006,
      offsetY: driftY + Math.cos(t * 19.7) * lineStart * 0.005,
      shake: lineStart * 0.9 + energy * 0.18,
      exposure: 1 + bass * 0.035 + lineStart * 0.04,
    };
  });
}