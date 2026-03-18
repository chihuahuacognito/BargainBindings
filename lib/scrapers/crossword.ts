import { fetchJson } from "@/lib/http";
import {
  buildErrorResult,
  buildSuccessResult,
  type CandidateListing,
  pickBestListing,
  type StoreScraper,
} from "@/lib/scrapers/base";
import type { CanonicalBook, ScrapeResult } from "@/lib/types";

interface CrosswordProduct {
  available?: boolean;
  title?: string;
  price?: string;
  url?: string;
  body?: string;
  vendor?: string;
}

interface CrosswordSuggestResponse {
  resources?: {
    results?: {
      products?: CrosswordProduct[];
    };
  };
}

function mapProduct(product: CrosswordProduct): CandidateListing | null {
  if (!product.title || !product.url) {
    return null;
  }

  return {
    title: product.title,
    productUrl: new URL(product.url, "https://www.crossword.in").toString(),
    priceInr: product.price ? Number(product.price) : null,
    availabilityText: product.available ? "Available" : "Sold out",
    author: product.vendor ?? null,
    notes: product.body ?? null,
  };
}

export const crosswordScraper: StoreScraper = {
  store: "crossword",
  async search(book: CanonicalBook): Promise<ScrapeResult> {
    const queries = [book.isbn13, `${book.title} ${book.authors[0] ?? ""}`].filter(Boolean) as string[];

    for (const query of queries) {
      try {
        const params = new URLSearchParams({
          q: query,
          "resources[type]": "product",
          "resources[limit]": "10",
        });
        const payload = await fetchJson<CrosswordSuggestResponse>(
          `https://www.crossword.in/search/suggest.json?${params.toString()}`,
          "crossword",
        );
        const candidates = (payload.resources?.results?.products ?? [])
          .map(mapProduct)
          .filter((value): value is CandidateListing => !!value);
        const best = pickBestListing(book, candidates);
        if (best) {
          return buildSuccessResult(book, "crossword", best);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        return buildErrorResult(book, "crossword", "parse_error", `Crossword lookup failed: ${message}`);
      }
    }

    return buildErrorResult(book, "crossword", "not_found", "No Crossword match found");
  },
};
