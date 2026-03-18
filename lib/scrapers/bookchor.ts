import * as cheerio from "cheerio";
import type { CanonicalBook, ScrapeResult } from "@/lib/types";
import { fetchText } from "@/lib/http";
import {
  buildErrorResult,
  buildSuccessResult,
  parseLowestPrice,
  pickBestListing,
  type CandidateListing,
  type StoreScraper,
} from "@/lib/scrapers/base";

function listingsFromHtml(html: string): CandidateListing[] {
  const $ = cheerio.load(html);
  const cards: CandidateListing[] = [];

  $('a[href*="/book/"]').each((_, element) => {
    const linkNode = $(element);
    const title = linkNode.text().trim();
    if (!title) {
      return;
    }

    const href = linkNode.attr("href") ?? null;
    const root = linkNode.closest(".product-item");
    const rawText = root.text().replace(/\s+/g, " ").trim();
    const author = rawText.match(new RegExp(`${title}\\s+([^₹]+?)\\s+₹`, "i"))?.[1]?.trim() ?? null;
    const isbn = href?.match(/\/book\/([0-9]{10,13})\//)?.[1] ?? null;

    cards.push({
      title,
      productUrl: href ? new URL(href, "https://www.bookchor.com").toString() : null,
      priceInr: parseLowestPrice(rawText),
      availabilityText: parseLowestPrice(rawText) !== null ? "Available" : null,
      author,
      isbn,
    });
  });

  return cards;
}

export const bookchorScraper: StoreScraper = {
  store: "bookchor",
  async search(book: CanonicalBook): Promise<ScrapeResult> {
    const queries = [book.isbn13, `${book.title} ${book.authors[0] ?? ""}`].filter(Boolean) as string[];

    for (const query of queries) {
      try {
        const html = await fetchText(
          `https://www.bookchor.com/search/?query=${encodeURIComponent(query)}`,
          "bookchor",
        );
        const candidates = listingsFromHtml(html);
        const best = pickBestListing(book, candidates);
        if (best) {
          return buildSuccessResult(book, "bookchor", best);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        return buildErrorResult(book, "bookchor", "parse_error", `BookChor parsing failed: ${message}`);
      }
    }

    return buildErrorResult(book, "bookchor", "not_found", "No BookChor match found");
  },
};
