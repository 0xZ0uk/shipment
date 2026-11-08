import { describe, expect, it } from "vitest";

import { isListedDoc, searchTextFromDoc } from "../helpers/searchText.js";

const lexical = (text: string) => ({
  root: {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", text }] }],
  },
});

describe("isListedDoc", () => {
  it("lists published documents and those without drafts", () => {
    expect(isListedDoc({ _status: "published" })).toBe(true);
    expect(isListedDoc({})).toBe(true);
  });

  it("leaves out drafts and noindex documents", () => {
    expect(isListedDoc({ _status: "draft" })).toBe(false);
    expect(isListedDoc({ _status: "published", noindex: true })).toBe(false);
    expect(isListedDoc({ _status: "published", meta: { noindex: true } })).toBe(false);
    expect(isListedDoc(null)).toBe(false);
  });
});

describe("searchTextFromDoc", () => {
  it("reads the title, meta description and block text", () => {
    const text = searchTextFromDoc(
      {
        title: "Pricing",
        meta: { title: "Pricing | Site", description: "Plans for every team." },
        layout: [
          { blockType: "hero", title: "Simple pricing", description: "Pay  monthly." },
          { blockType: "richText", content: lexical("Cancel anytime.") },
        ],
      },
      "pages",
    );
    expect(text.title).toBe("Pricing");
    expect(text.description).toBe("Plans for every team.");
    expect(text.body).toContain("Simple pricing");
    expect(text.body).toContain("Pay monthly.");
    expect(text.body).toContain("Cancel anytime.");
  });

  it("uses a collection extractor when one is given", () => {
    const text = searchTextFromDoc(
      { title: "Doc", sections: [{ blockType: "x", title: "From sections" }] },
      "docs",
      {
        extractors: { docs: ({ doc, defaultExtract }) => defaultExtract(doc.sections) },
      },
    );
    expect(text.body).toContain("From sections");
  });

  it("falls back to the meta title and copes with an empty document", () => {
    expect(searchTextFromDoc({ meta: { title: "Meta only" } }, "pages").title).toBe("Meta only");
    expect(searchTextFromDoc(undefined, "pages")).toEqual({ title: "", description: "", body: "" });
  });
});
