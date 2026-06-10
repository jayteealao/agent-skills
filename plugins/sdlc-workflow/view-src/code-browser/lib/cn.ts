// view-src/code-browser/lib/cn.ts
//
// Minimal stand-in for the shadcn `cn` helper (clsx + tailwind-merge). The
// vendored components are the only callers and never pass conflicting
// utility pairs, so a plain join keeps two deps out of the bundle.

export type ClassValue = string | number | null | undefined | false | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const v of inputs.flat(Infinity as 1)) {
    if (typeof v === 'string' && v) out.push(v);
    else if (typeof v === 'number') out.push(String(v));
  }
  return out.join(' ');
}
