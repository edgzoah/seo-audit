import assert from "node:assert/strict";
import { test } from "vitest";

import { extractPageData } from "../index.js";

test("extractPageData deduplicates identical internal links and increments occurrences", () => {
  const html = `
    <html>
      <body>
        <main>
          <a href="/cennik">Cennik</a>
          <a href="/cennik">Cennik</a>
          <a href="/cennik">Cennik</a>
          <a href="/cennik">Cennik</a>
          <a href="/cennik">Cennik</a>
        </main>
      </body>
    </html>
  `;

  const page = extractPageData(html, "https://example.com/", "https://example.com/", 200, {});
  assert.equal(page.outlinksInternal.length, 1);
  assert.deepEqual(page.outlinksInternal[0], {
    targetUrl: "https://example.com/cennik",
    anchorText: "Cennik",
    rel: "",
    isNavLikely: false,
    occurrences: 5,
  });
});

test("extractPageData keeps separate internal link entries for different anchor/rel/nav combinations", () => {
  const html = `
    <html>
      <body>
        <nav><a href="/cennik" rel="nofollow">Cennik</a></nav>
        <main>
          <a href="/cennik">Cennik</a>
          <a href="/cennik">Oferta i cennik</a>
        </main>
      </body>
    </html>
  `;

  const page = extractPageData(html, "https://example.com/", "https://example.com/", 200, {});
  assert.equal(page.outlinksInternal.length, 3);
  assert.deepEqual(
    page.outlinksInternal.map((item) => ({
      anchorText: item.anchorText,
      rel: item.rel,
      isNavLikely: item.isNavLikely,
      occurrences: item.occurrences,
    })),
    [
      { anchorText: "Cennik", rel: "", isNavLikely: false, occurrences: 1 },
      { anchorText: "Cennik", rel: "nofollow", isNavLikely: true, occurrences: 1 },
      { anchorText: "Oferta i cennik", rel: "", isNavLikely: false, occurrences: 1 },
    ],
  );
});

test("extractPageData output order is stable for outlinksInternal records", () => {
  const html = `
    <html>
      <body>
        <a href="/b">B</a>
        <a href="/a">A2</a>
        <a href="/a">A1</a>
      </body>
    </html>
  `;

  const page = extractPageData(html, "https://example.com/", "https://example.com/", 200, {});
  assert.deepEqual(
    page.outlinksInternal.map((item) => `${item.targetUrl}|${item.anchorText}`),
    ["https://example.com/a|A1", "https://example.com/a|A2", "https://example.com/b|B"],
  );
});
