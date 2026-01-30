// web/lib/mux.ts
export function muxSignedHlsUrl(playbackId: string, jwt: string) {
  return `https://stream.mux.com/${playbackId}.m3u8?signature=${encodeURIComponent(jwt)}`;
}
