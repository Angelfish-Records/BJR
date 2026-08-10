//lib/campaigns/template.ts
export function mergeTemplate(
  tpl: string,
  vars: Record<string, string>,
): string {
  return tpl.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_m, k: string) => vars[k] ?? "",
  );
}
