import type { CanonicalBook, ScrapeResult } from "@/lib/types";
import { fetchText } from "@/lib/http";
import { buildErrorResult, type StoreScraper } from "@/lib/scrapers/base";

export const flipkartScraper: StoreScraper = {
  store: "flipkart",
  async search(book: CanonicalBook): Promise<ScrapeResult> {
    const query = book.isbn13 ?? `${book.title} ${book.authors[0] ?? ""} book`;

    try {
      await fetchText(`https://www.flipkart.com/search?q=${encodeURIComponent(query)}`, "flipkart");
      return buildErrorResult(book, "flipkart", "blocked", "Flipkart search requires reCAPTCHA for server-side fetches");
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      if (message.startsWith("blocked:") || message.startsWith("fetch_failed:403")) {
        return buildErrorResult(book, "flipkart", "blocked", "Flipkart returned a reCAPTCHA or block page");
      }

      return buildErrorResult(book, "flipkart", "parse_error", `Flipkart lookup failed: ${message}`);
    }
  },
};
