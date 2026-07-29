// src/styles/tokens.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A `var(--typo)` that names no declared custom property is invalid at computed
 * value time: the declaration falls back to the property's initial value, so a
 * misspelled surface token silently paints a popup transparent instead of
 * failing loudly. Guard the whole stylesheet against that class of bug.
 */
const CSS_FILES = ["../styles.css", "./tokens.css"].map((path) =>
  fileURLToPath(new URL(path, import.meta.url)),
);

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("design tokens", () => {
  const sources = CSS_FILES.map((file) => stripComments(readFileSync(file, "utf8")));
  const declared = new Set(
    sources.flatMap((css) => [...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1])),
  );

  it("declares every custom property the stylesheets reference", () => {
    const referenced = new Set(
      sources.flatMap((css) => [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1])),
    );
    const undeclared = [...referenced].filter((token) => !declared.has(token)).sort();

    expect(undeclared).toEqual([]);
  });
});
