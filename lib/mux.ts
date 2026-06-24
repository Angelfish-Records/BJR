// web/lib/mux.ts

export function muxSignedHlsUrl(playbackId: string, jwt: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8?signature=${encodeURIComponent(jwt)}`;
}

export function muxPublicStaticAudioUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}/audio.m4a`;
}