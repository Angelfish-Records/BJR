// web/lib/mux.ts

export function muxSignedHlsUrl(playbackId: string, jwt: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8?token=${encodeURIComponent(jwt)}`;
}

export function muxSignedStaticAudioUrl(
  playbackId: string,
  jwt: string,
): string {
  return `https://stream.mux.com/${playbackId}/audio.m4a?token=${encodeURIComponent(jwt)}`;
}