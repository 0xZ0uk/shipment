/**
 * What a site search index needs from a document: whether it is listed at all, and its text.
 *
 * `isListedDoc` is the per-document part of the sitemap's filter (published, not `noindex`);
 * the host's `excludeDocs` predicate comes on top. `searchTextFromDoc` reads the text through
 * `seoInputFromDoc`, so a search index sees the same copy as the analyzer (the `layout` walk
 * or the collection's `extractContent` extractor, the hero and the post body).
 */
import { seoInputFromDoc, type SeoInputOptions } from "./seoInputFromDoc.js";
import { sidebarContentText } from "./sidebarContent.js";

export interface DocSearchText {
  title: string;
  description: string;
  /** The page's copy as one plain-text string. */
  body: string;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** True for a document the sitemap lists: not a draft and not `noindex`. */
export function isListedDoc(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const d = record(doc);
  if (d._status === "draft") return false;
  return d.noindex !== true && record(d.meta).noindex !== true;
}

/**
 * Title, meta description and body text of a document of `collection`. Populate it like
 * `/validate` reads it (`depth: 1`) for reusable sections and `reference` links to count.
 */
export function searchTextFromDoc(
  doc: unknown,
  collection: string,
  options: SeoInputOptions = {},
): DocSearchText {
  const d = record(doc);
  const input = seoInputFromDoc(d, { collection }, options);
  return {
    title: text(d.title) || text(input.metaTitle),
    description: text(input.metaDescription),
    body: sidebarContentText(input).replace(/\s+/g, " ").trim(),
  };
}
