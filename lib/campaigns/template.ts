//lib/campaigns/template.ts
export function mergeTemplate(
  tpl: string,
  vars: Record<string, string>,
): string {
  return tpl.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_m, k: string) => vars[k] ?? "",
  );
}
