// web/app/home/player/mediaSurface.ts
"use client";

export type MediaStatus = "idle" | "loading" | "playing" | "paused" | "blocked";
export type StageVariant = "inline" | "fullscreen";

export type MediaEvent =
  | { type: "time"; ms: number }
  | { type: "status"; status: MediaStatus }
  | { type: "track"; id: string | null }
  | { type: "stage"; variant: StageVariant | null };

type Listener = (e: MediaEvent) => void;

class MediaSurface {
  private readonly listeners = new Set<Listener>();
  private lastTimeMs = 0;
  private lastStatus: MediaStatus = "idle";
  private lastRecordingId: string | null = null;
  private lastTrackProgress01 = 0;

  // Stage “authority”
  private inlineCount = 0;
  private fullscreenCount = 0;
  private activeStage: StageVariant | null = null;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn({ type: "time", ms: this.lastTimeMs });
    fn({ type: "status", status: this.lastStatus });
    fn({ type: "track", id: this.lastRecordingId });
    fn({ type: "stage", variant: this.activeStage });

    return () => {
      this.listeners.delete(fn);
    };
  }

  /* ---------------- media state ---------------- */

  setTime(ms: number) {
    this.lastTimeMs = ms;

    if (ms <= 0) {
      this.lastTrackProgress01 = 0;
    }

    for (const fn of this.listeners) fn({ type: "time", ms });
  }

  setStatus(status: MediaStatus) {
    this.lastStatus = status;
    for (const fn of this.listeners) fn({ type: "status", status });
  }

  setTrack(id: string | null) {
    if (id !== this.lastRecordingId) {
      this.lastTrackProgress01 = 0;
    }

    this.lastRecordingId = id;
    for (const fn of this.listeners) fn({ type: "track", id });
  }

  setTrackProgress01(progress01: number) {
    this.lastTrackProgress01 = Number.isFinite(progress01)
      ? Math.max(0, Math.min(1, progress01))
      : 0;
  }

  getTimeMs() {
    return this.lastTimeMs;
  }

  getTrackProgress01() {
    return this.lastTrackProgress01;
  }

  getStatus() {
    return this.lastStatus;
  }

  getRecordingId() {
    return this.lastRecordingId;
  }

  /* ---------------- stage authority ---------------- */

  private recomputeStage() {
    let next: StageVariant | null = null;
    if (this.fullscreenCount > 0) {
      next = "fullscreen";
    } else if (this.inlineCount > 0) {
      next = "inline";
    }

    if (next === this.activeStage) return;
    this.activeStage = next;
    for (const fn of this.listeners) fn({ type: "stage", variant: next });
  }

  registerStage(variant: StageVariant) {
    if (variant === "fullscreen") this.fullscreenCount++;
    else this.inlineCount++;
    this.recomputeStage();

    return () => {
      if (variant === "fullscreen")
        this.fullscreenCount = Math.max(0, this.fullscreenCount - 1);
      else this.inlineCount = Math.max(0, this.inlineCount - 1);
      this.recomputeStage();
    };
  }

  getStageVariant(): StageVariant | null {
    return this.activeStage;
  }
}

export const mediaSurface = new MediaSurface();
