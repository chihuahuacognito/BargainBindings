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

  $("div.list-view-books").each((_, element) => {
    const root = $(element);
    const productLinks = root.find('a[href*="/book/"]');
    const productLink =
      productLinks
        .toArray()
        .map((element) => $(element))
        .find((link) => link.text().trim()) ?? productLinks.first();
    const title = productLink.text().trim();
    const href = productLink.attr("href") ?? null;
    const rawText = root.text().replace(/\s+/g, " ").trim();
    const author = root.find(".author, .authorname").first().text().trim() || null;
    const availabilityText =
      root.find(".available, .deliverytext, .stockstatus").first().text().trim() ||
      rawText.match(/(Available.*?|Out of Stock.*?|Ships within .*?Days)/i)?.[1] ||
      null;
    const isbnText = href?.match(/\/([0-9Xx]{10,13})$/)?.[1] ?? rawText.match(/(?:ISBN(?:-13)?:?\s*)([0-9Xx-]{10,17})/)?.[1] ?? null;

    if (title) {
      listings.push({
        title,
        productUrl: href ? new URL(href, "https://www.bookswagon.com").toString() : null,
        priceInr: parseLowestPrice(rawText),
        availabilityText,
        author,
        isbn: isbnText,
      });
    }
  });

  return listings;
}

export const bookswagonScraper: StoreScraper = {
  store: "bookswagon",
  async search(book: CanonicalBook): Promise<ScrapeResult> {
    const queries = [book.isbn13, `${book.title} ${book.authors[0] ?? ""}`].filter(Boolean) as string[];

    for (const query of queries) {
      try {
        const url = `https://www.bookswagon.com/search-books/${encodeURIComponent(query)}`;
        const html = await fetchText(url, "bookswagon");
        const candidates = listingsFromHtml(html);
        const best = pickBestListing(book, candidates);
        if (best) {
          return buildSuccessResult(book, "bookswagon", best);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        if (message.startsWith("blocked:")) {
          return buildErrorResult(book, "bookswagon", "blocked", "Bookswagon blocked the scraper request");
        }
        if (message.startsWith("fetch_failed:")) {
          continue;
        }
        return buildErrorResult(book, "bookswagon", "parse_error", `Bookswagon parsing failed: ${message}`);
      }
    }

    return buildErrorResult(book, "bookswagon", "not_found", "No Bookswagon match found");
  },
};
