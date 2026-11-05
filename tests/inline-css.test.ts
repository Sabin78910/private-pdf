import { describe, expect, it } from "vitest";
import { inlineCssInto } from "../scripts/inline-css";

describe("inlineCssInto", () => {
  it("swaps the stylesheet link for a style tag and fixes relative urls", () => {
    const html = '<head><link rel="stylesheet" crossorigin href="./assets/index-abc.css"></head>';
    const out = inlineCssInto(html, "assets/index-abc.css", "a{background:url(./font.woff2)}b{background:url('./x.webp')}");
    expect(out).toBe("<head><style>a{background:url(./assets/font.woff2)}b{background:url('./assets/x.webp')}</style></head>");
  });
  it("leaves pages that do not link the file alone", () => {
    expect(inlineCssInto("<head></head>", "assets/a.css", "a{}")).toBe("<head></head>");
  });
});
