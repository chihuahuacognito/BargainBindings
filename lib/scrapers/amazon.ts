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
  const listings: CandidateListing[] = [];

  $('div[data-component-type="s-search-result"]').each((_, element) => {
    const root = $(element);
    const titleLink = root.find("a.a-link-normal.s-link-style.a-text-normal").first();
    const href = titleLink.attr("href") ?? null;
    const title = titleLink.text().trim();
    const rawText = root.text().replace(/\s+/g, " ").trim();
    const author = root.find('a[href*="/e/"]').first().text().trim() || null;
    const availabilityText =
      rawText.match(/(Currently unavailable|In stock|FREE delivery.*?|Usually dispatched.*?)/i)?.[1] ||
      (parseLowestPrice(rawText) !== null ? "Available" : null);

    if (title && href) {
      listings.push({
        title,
        productUrl: new URL(href, "https://www.amazon.in").toString(),
        priceInr: parseLowestPrice(rawText),
        availabilityText,
        author,
      });
    }
  });

  return listings;
}

export const amazonScraper: StoreScraper = {
  store: "amazon",
  async search(book: CanonicalBook): Promise<ScrapeResult> {
    const queries = [book.isbn13, `${book.title} ${book.authors[0] ?? ""} book`].filter(Boolean) as string[];

    for (const query of queries) {
      try {
        const url = `https://www.amazon.in/s?k=${encodeURIComponent(query)}`;
        const html = await fetchText(url, "amazon");
        const candidates = listingsFromHtml(html);
        const best = pickBestListing(book, candidates);
        if (best) {
          return buildSuccessResult(book, "amazon", best);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        if (message.startsWith("blocked:")) {
          return buildErrorResult(book, "amazon", "blocked", "Amazon.in blocked the scraper request");
        }
        if (message.startsWith("fetch_failed:")) {
          continue;
        }
        return buildErrorResult(book, "amazon", "parse_error", `Amazon.in parsing failed: ${message}`);
      }
    }

    return buildErrorResult(book, "amazon", "not_found", "No Amazon.in match found");
  },
};
