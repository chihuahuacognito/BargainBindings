import * as cheerio from "cheerio";
import type { CanonicalBook, ScrapeResult } from "@/lib/types";
import { fetchText } from "@/lib/http";
import {
  buildErrorResult,
  buildSuccessResult,
  extractJsonLd,
  parseLowestPrice,
  pickBestListing,
  type CandidateListing,
  type StoreScraper,
} from "@/lib/scrapers/base";

type JsonLdProduct = {
  "@type"?: unknown;
  name?: unknown;
  url?: unknown;
  isbn?: unknown;
  sku?: unknown;
  brand?: {
    name?: unknown;
  };
  offers?:
    | {
        price?: unknown;
        availability?: unknown;
      }
    | Array<{
        price?: unknown;
        availability?: unknown;
      }>;
};

function listingsFromHtml(html: string): CandidateListing[] {
  const $ = cheerio.load(html);
  const cards: CandidateListing[] = [];

  $('a.full-unstyled-link[href*="/products/"]').each((_, element) => {
    const linkNode = $(element);
    const title = linkNode.text().trim();
    const link = linkNode.attr("href") ?? null;
    const root = linkNode.closest(".card");
    const rawText = root.text().replace(/\s+/g, " ").trim();
    const availabilityText = rawText.match(/(Sold out|Out of stock|Available)/i)?.[1] ?? null;

    if (title) {
      cards.push({
        title,
        productUrl: link ? new URL(link, "https://gyaanstore.com").toString() : null,
        priceInr: parseLowestPrice(rawText),
        availabilityText,
      });
    }
  });

  return cards;
}

function productFromJsonLd(entry: unknown): CandidateListing | null {
  const product = entry as JsonLdProduct | null;
  if (!product || product["@type"] !== "Product") {
    return null;
  }

  const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;

  return {
    title: typeof product.name === "string" ? product.name : "",
    productUrl: typeof product.url === "string" ? product.url : null,
    priceInr: offer?.price ? Number(offer.price) : null,
    availabilityText: typeof offer?.availability === "string" ? offer.availability : null,
    isbn: typeof product.isbn === "string" ? product.isbn : typeof product.sku === "string" ? product.sku : null,
    author: typeof product.brand?.name === "string" ? product.brand.name : null,
  };
}

export const gyaanstoreScraper: StoreScraper = {
  store: "gyaanstore",
  async search(book: CanonicalBook): Promise<ScrapeResult> {
    const queries = [book.isbn13, `${book.title} ${book.authors[0] ?? ""}`].filter(Boolean) as string[];

    for (const query of queries) {
      try {
        const url = `https://gyaanstore.com/search?q=${encodeURIComponent(query)}`;
        const html = await fetchText(url, "gyaanstore");
        const candidates = [
          ...extractJsonLd(html).map(productFromJsonLd).filter((value): value is CandidateListing => !!value),
          ...listingsFromHtml(html),
        ];
        const best = pickBestListing(book, candidates);
        if (best) {
          return buildSuccessResult(book, "gyaanstore", best);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        if (message.startsWith("blocked:")) {
          return buildErrorResult(book, "gyaanstore", "blocked", "Gyaanstore blocked the scraper request");
        }
        if (message.startsWith("fetch_failed:")) {
          continue;
        }
        return buildErrorResult(book, "gyaanstore", "parse_error", `Gyaanstore parsing failed: ${message}`);
      }
    }

    return buildErrorResult(book, "gyaanstore", "not_found", "No Gyaanstore match found");
  },
};
