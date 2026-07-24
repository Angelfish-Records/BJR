// web/app/home/player/visualizer/offline/previewTimeline.ts

import { bakeAudioFeatureFrames } from "./audioFeatureBake";
import { bakeLyricFrameStates } from "./lyricTimeline";
import { parseLrc } from "./lrc";
import type { AudioFeatureFrame } from "./offlineTypes";
import type { LyricFrameState } from "./lyricTypes";

export type PreviewSourceTimeline = {
  audioFrames: AudioFeatureFrame[];
  lyricFrames: LyricFrameState[] | null;
  durationSec: number;
};

export type PreviewSourceTimelineConfig = {
  audioUrl: string;
  lrcUrl: string | null;
  fps: number;
};

async function fetchRequiredArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch preview audio: ${response.status} ${response.statusText}`,
    );
  }

  return response.arrayBuffer();
}

async function fetchRequiredText(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch preview lyrics: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

export async function bakePreviewSourceTimeline(
  config: PreviewSourceTimelineConfig,
): Promise<PreviewSourceTimeline> {
  if (!Number.isFinite(config.fps) || config.fps <= 0) {
    throw new Error(`Invalid preview FPS: ${config.fps}`);
  }

  const arrayBuffer = await fetchRequiredArrayBuffer(config.audioUrl);
  const audioContext = new AudioContext();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const audioFrames = bakeAudioFeatureFrames({
      audioBuffer,
      fps: config.fps,
    });

    const durationSec = audioBuffer.duration;
    const lyricFrames = config.lrcUrl
      ? bakeLyricFrameStates({
          cues: parseLrc(await fetchRequiredText(config.lrcUrl)),
          fps: config.fps,
          durationSec,
        })
      : null;

    return {
      audioFrames,
      lyricFrames,
      durationSec,
    };
  } finally {
    await audioContext.close();
  }
}
