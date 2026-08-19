// web/app/home/player/visualizer/audioFeatureBands.ts
export type AudioFeatureBandBins = Readonly<{
  bassStart: number;
  bassEnd: number;
  midStart: number;
  midEnd: number;
  trebleStart: number;
  trebleEnd: number;
}>;

export const VISUALIZER_AUDIO_FFT_SIZE = 2048;

export const VISUALIZER_AUDIO_BANDS_HZ = {
  bass: { min: 20, max: 250 },
  mid: { min: 250, max: 4000 },
  treble: { min: 4000 },
} as const;

function clampBin(index: number, spectrumLength: number): number {
  if (spectrumLength <= 0) return 0;
  return Math.max(0, Math.min(spectrumLength, index));
}

function firstBinAtOrAboveHz(
  hz: number,
  sampleRate: number,
  fftSize: number,
  spectrumLength: number,
): number {
  if (
    !Number.isFinite(hz) ||
    !Number.isFinite(sampleRate) ||
    !Number.isFinite(fftSize) ||
    sampleRate <= 0 ||
    fftSize <= 0
  ) {
    return 0;
  }

  return clampBin(
    Math.ceil((hz * fftSize) / sampleRate),
    spectrumLength,
  );
}

/**
 * Canonical musical band ownership for the BJR visualizer.
 *
 * The returned ranges are half-open [start, end), so a boundary bin belongs to
 * exactly one band. This helper deliberately owns frequency semantics only.
 * Realtime and offline currently use different spectral magnitude domains and
 * calibration curves; keeping those calibrations separate avoids silently
 * retuning every theme while still preventing bass/mid/treble definitions from
 * drifting apart again.
 */
export function visualizerAudioBandBins(
  sampleRate: number,
  fftSize: number,
  spectrumLength: number,
): AudioFeatureBandBins {
  const safeLength =
    Number.isFinite(spectrumLength) && spectrumLength > 0
      ? Math.floor(spectrumLength)
      : 0;

  const bassStart = firstBinAtOrAboveHz(
    VISUALIZER_AUDIO_BANDS_HZ.bass.min,
    sampleRate,
    fftSize,
    safeLength,
  );
  const bassEnd = firstBinAtOrAboveHz(
    VISUALIZER_AUDIO_BANDS_HZ.bass.max,
    sampleRate,
    fftSize,
    safeLength,
  );
  const midStart = bassEnd;
  const midEnd = firstBinAtOrAboveHz(
    VISUALIZER_AUDIO_BANDS_HZ.mid.max,
    sampleRate,
    fftSize,
    safeLength,
  );
  const trebleStart = midEnd;

  return {
    bassStart,
    bassEnd,
    midStart,
    midEnd,
    trebleStart,
    trebleEnd: safeLength,
  };
}

export function averageNormalizedByteSpectrumRange(
  spectrum: Uint8Array,
  start: number,
  end: number,
): number {
  const safeStart = Math.max(0, Math.min(spectrum.length, Math.floor(start)));
  const safeEnd = Math.max(
    safeStart,
    Math.min(spectrum.length, Math.floor(end)),
  );

  let sum = 0;
  let count = 0;

  for (let index = safeStart; index < safeEnd; index += 1) {
    sum += (spectrum[index] ?? 0) / 255;
    count += 1;
  }

  return count > 0 ? sum / count : 0;
}
