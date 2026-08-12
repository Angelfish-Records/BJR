export const EXEGESIS_COMMENT_EDIT_WINDOW_MINUTES = 15;

export const EXEGESIS_COMMENT_EDIT_WINDOW_MS =
  EXEGESIS_COMMENT_EDIT_WINDOW_MINUTES * 60 * 1000;

export function exegesisCommentEditExpiresAtMs(
  createdAt: string,
): number | null {
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return null;

  return createdAtMs + EXEGESIS_COMMENT_EDIT_WINDOW_MS;
}

export function isExegesisCommentEditWindowOpen(
  createdAt: string,
  nowMs: number,
): boolean {
  const expiresAtMs = exegesisCommentEditExpiresAtMs(createdAt);
  return expiresAtMs !== null && nowMs < expiresAtMs;
}
