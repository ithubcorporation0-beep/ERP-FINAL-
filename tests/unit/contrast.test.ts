import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards accessible contrast: every text/background token pair in globals.css must meet
 * WCAG AA for normal text (4.5:1) in both light and dark themes.
 */

const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");

function readTokens(selector: ":root" | ".dark"): Map<string, [number, number, number]> {
  const block = css.match(new RegExp(`^${selector.replace(".", "\\.")} \\{([\\s\\S]*?)^\\}`, "m"))?.[1];
  if (!block) throw new Error(`Block ${selector} not found in globals.css`);
  const tokens = new Map<string, [number, number, number]>();
  for (const match of block.matchAll(/--([\w-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g)) {
    const [, name, l, c, h] = match;
    if (name && l && c && h) tokens.set(name, [Number(l), Number(c), Number(h)]);
  }
  return tokens;
}

/** OKLCH → relative luminance (via OKLab → linear sRGB), per the CSS Color 4 spec. */
function luminance([L, C, H]: [number, number, number]): number {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

function contrast(x: [number, number, number], y: [number, number, number]): number {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS: Array<[text: string, background: string]> = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "background"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "card"],
  ["primary-foreground", "primary"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive", "background"],
  ["success", "success-muted"],
  ["warning", "warning-muted"],
  ["danger", "danger-muted"],
  ["info", "info-muted"],
  ["neutral", "neutral-muted"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["muted-foreground", "sidebar"],
];

describe.each([":root", ".dark"] as const)("contrast in %s", (selector) => {
  const tokens = readTokens(selector);

  it.each(PAIRS)("%s on %s meets WCAG AA (4.5:1)", (text, background) => {
    const fg = tokens.get(text);
    const bg = tokens.get(background);
    expect(fg, `--${text} missing in ${selector}`).toBeDefined();
    expect(bg, `--${background} missing in ${selector}`).toBeDefined();
    if (fg && bg) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
