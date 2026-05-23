// web/app/home/player/visualizer/offline/audioFeatureBake.ts
import type { AudioFeatures } from "../types";
import type { AudioFeatureFrame } from "./offlineTypes";

export type AudioFeatureBakeConfig = {
  audioBuffer: AudioBuffer;
  fps: number;
  durationSec?: number;
  fftSize?: number;
  smoothing?: number;
};

type BandBins = {
  bassStart: number;
  bassEnd: number;
  midStart: number;
  midEnd: number;
  trebleStart: number;
  trebleEnd: number;
};

const DEFAULT_FFT_SIZE = 2048;
const DEFAULT_SMOOTHING = 0.72;
const MIN_FFT_SIZE = 256;
const MAX_FFT_SIZE = 16384;

function nextPowerOfTwo(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_FFT_SIZE;

  let n = 1;
  while (n < value) n *= 2;
  return n;
}

function normalizeFftSize(value: number | undefined): number {
  const requested = value ?? DEFAULT_FFT_SIZE;
  const pow2 = nextPowerOfTwo(Math.max(MIN_FFT_SIZE, requested));
  return Math.min(MAX_FFT_SIZE, pow2);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function averageChannels(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < buffer.length; i += 1) {
      out[i] += data[i] / buffer.numberOfChannels;
    }
  }

  return out;
}

function rmsForWindow(
  samples: Float32Array,
  start: number,
  end: number,
): number {
  let sum = 0;
  let count = 0;

  for (let i = start; i < end && i < samples.length; i += 1) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
    count += 1;
  }

  if (count === 0) return 0;
  return Math.sqrt(sum / count);
}

function makeWindowedFrame(
  samples: Float32Array,
  centerSample: number,
  fftSize: number,
): Float32Array {
  const frame = new Float32Array(fftSize);
  const half = Math.floor(fftSize / 2);
  const start = centerSample - half;

  for (let i = 0; i < fftSize; i += 1) {
    const sourceIndex = start + i;
    const sample =
      sourceIndex >= 0 && sourceIndex < samples.length
        ? samples[sourceIndex]
        : 0;

    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1));
    frame[i] = sample * hann;
  }

  return frame;
}

function reverseBits(value: number, bits: number): number {
  let reversed = 0;

  for (let i = 0; i < bits; i += 1) {
    reversed = (reversed << 1) | (value & 1);
    value >>= 1;
  }

  return reversed;
}

function magnitudeSpectrum(frame: Float32Array): Float32Array {
  const n = frame.length;
  const bits = Math.log2(n);

  if (!Number.isInteger(bits)) {
    throw new Error(`FFT size must be a power of two, got ${n}`);
  }

  const real = new Float32Array(n);
  const imag = new Float32Array(n);

  for (let i = 0; i < n; i += 1) {
    real[reverseBits(i, bits)] = frame[i] ?? 0;
  }

  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const tableStep = (-2 * Math.PI) / size;

    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < halfSize; j += 1) {
        const angle = tableStep * j;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);

        const evenIndex = start + j;
        const oddIndex = evenIndex + halfSize;

        const oddReal = real[oddIndex] ?? 0;
        const oddImag = imag[oddIndex] ?? 0;

        const tr = wr * oddReal - wi * oddImag;
        const ti = wr * oddImag + wi * oddReal;

        const evenReal = real[evenIndex] ?? 0;
        const evenImag = imag[evenIndex] ?? 0;

        real[oddIndex] = evenReal - tr;
        imag[oddIndex] = evenImag - ti;
        real[evenIndex] = evenReal + tr;
        imag[evenIndex] = evenImag + ti;
      }
    }
  }

  const bins = Math.floor(n / 2);
  const spectrum = new Float32Array(bins);

  for (let i = 0; i < bins; i += 1) {
    const r = real[i] ?? 0;
    const im = imag[i] ?? 0;
    spectrum[i] = Math.sqrt(r * r + im * im) / n;
  }

  return spectrum;
}

function binForHz(hz: number, sampleRate: number, fftSize: number): number {
  return Math.max(0, Math.floor((hz * fftSize) / sampleRate));
}

function bandBins(sampleRate: number, fftSize: number): BandBins {
  const maxBin = Math.floor(fftSize / 2) - 1;

  return {
    bassStart: binForHz(20, sampleRate, fftSize),
    bassEnd: Math.min(maxBin, binForHz(250, sampleRate, fftSize)),
    midStart: Math.min(maxBin, binForHz(250, sampleRate, fftSize)),
    midEnd: Math.min(maxBin, binForHz(4000, sampleRate, fftSize)),
    trebleStart: Math.min(maxBin, binForHz(4000, sampleRate, fftSize)),
    trebleEnd: maxBin,
  };
}

function averageSpectrumRange(
  spectrum: Float32Array,
  start: number,
  end: number,
): number {
  let sum = 0;
  let count = 0;

  for (let i = start; i <= end && i < spectrum.length; i += 1) {
    sum += spectrum[i] ?? 0;
    count += 1;
  }

  if (count === 0) return 0;
  return sum / count;
}

function spectralCentroid01(
  spectrum: Float32Array,
  sampleRate: number,
  fftSize: number,
): number {
  let weighted = 0;
  let total = 0;

  for (let i = 0; i < spectrum.length; i += 1) {
    const mag = spectrum[i] ?? 0;
    const hz = (i * sampleRate) / fftSize;
    weighted += hz * mag;
    total += mag;
  }

  if (total <= 0) return 0;

  const nyquist = sampleRate / 2;
  return clamp01(weighted / total / nyquist);
}

function smoothValue(
  previous: number,
  next: number,
  smoothing: number,
): number {
  return previous * smoothing + next * (1 - smoothing);
}

export function bakeAudioFeatureFrames(
  config: AudioFeatureBakeConfig,
): AudioFeatureFrame[] {
  const { audioBuffer, fps } = config;

  if (fps <= 0 || !Number.isFinite(fps)) {
    throw new Error(`Invalid FPS for audio feature bake: ${fps}`);
  }

  const fftSize = normalizeFftSize(config.fftSize);
  const smoothing = clamp01(config.smoothing ?? DEFAULT_SMOOTHING);
  const durationSec = config.durationSec ?? audioBuffer.duration;
  const frameCount = Math.ceil(durationSec * fps);
  const samples = averageChannels(audioBuffer);
  const bins = bandBins(audioBuffer.sampleRate, fftSize);

  const frames: AudioFeatureFrame[] = [];

  let prev: Required<AudioFeatures> = {
    energy: 0,
    rms: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    centroid: 0,
  };

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const time = frameIndex / fps;
    const centerSample = Math.floor(time * audioBuffer.sampleRate);
    const windowStart = centerSample;
    const windowEnd = centerSample + Math.floor(audioBuffer.sampleRate / fps);

    const rawRms = rmsForWindow(samples, windowStart, windowEnd);
    const spectrum = magnitudeSpectrum(
      makeWindowedFrame(samples, centerSample, fftSize),
    );

    const rawBass = averageSpectrumRange(
      spectrum,
      bins.bassStart,
      bins.bassEnd,
    );
    const rawMid = averageSpectrumRange(spectrum, bins.midStart, bins.midEnd);
    const rawTreble = averageSpectrumRange(
      spectrum,
      bins.trebleStart,
      bins.trebleEnd,
    );
    const rawCentroid = spectralCentroid01(
      spectrum,
      audioBuffer.sampleRate,
      fftSize,
    );

    const scaled: Required<AudioFeatures> = {
      rms: clamp01(rawRms * 8),
      bass: clamp01(rawBass * 180),
      mid: clamp01(rawMid * 260),
      treble: clamp01(rawTreble * 420),
      centroid: rawCentroid,
      energy: clamp01(rawRms * 8),
    };

    prev = {
      rms: smoothValue(prev.rms, scaled.rms, smoothing),
      bass: smoothValue(prev.bass, scaled.bass, smoothing),
      mid: smoothValue(prev.mid, scaled.mid, smoothing),
      treble: smoothValue(prev.treble, scaled.treble, smoothing),
      centroid: smoothValue(prev.centroid, scaled.centroid, smoothing),
      energy: smoothValue(prev.energy, scaled.energy, smoothing),
    };

    frames.push({
      frameIndex,
      time,
      ...prev,
    });
  }

  return frames;
}
