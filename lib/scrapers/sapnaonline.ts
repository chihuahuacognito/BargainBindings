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

  $('a[href*="/books/"]').each((_, element) => {
    const linkNode = $(element);
    const title = linkNode.text().trim();
    const root = linkNode.closest(".ProductCard__CardBox-sc-10n3822-5");
    const rawText = root.text().replace(/\s+/g, " ").trim();
    const href = linkNode.attr("href") ?? null;
    const author = rawText.match(/by\s+([^,]+),/i)?.[1]?.trim() ?? null;
    const isbn = href?.match(/-([0-9]{13})$/)?.[1] ?? null;

    if (title && href) {
      cards.push({
        title,
        productUrl: new URL(href, "https://www.sapnaonline.com").toString(),
        priceInr: parseLowestPrice(rawText),
        availabilityText: rawText.includes("Add to Cart") ? "Available" : null,
        author,
        isbn,
      });
    }
  });

  return cards;
}

export const sapnaonlineScraper: StoreScraper = {
  store: "sapnaonline",
  async search(book: CanonicalBook): Promise<ScrapeResult> {
    const queries = [book.isbn13, `${book.title} ${book.authors[0] ?? ""}`].filter(Boolean) as string[];

    for (const query of queries) {
      try {
        const html = await fetchText(
          `https://www.sapnaonline.com/search?keyword=${encodeURIComponent(query)}`,
          "sapnaonline",
        );
        const candidates = listingsFromHtml(html);
        const best = pickBestListing(book, candidates);
        if (best) {
          return buildSuccessResult(book, "sapnaonline", best);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        return buildErrorResult(book, "sapnaonline", "parse_error", `SapnaOnline parsing failed: ${message}`);
      }
    }

    return buildErrorResult(book, "sapnaonline", "not_found", "No SapnaOnline match found");
  },
};
