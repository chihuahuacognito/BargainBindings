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
  description?: unknown;
  brand?: {
    name?: unknown;
  };
  offers?:
    | {
        price?: unknown;
        availability?: unknown;
        itemCondition?: unknown;
      }
    | Array<{
        price?: unknown;
        availability?: unknown;
        itemCondition?: unknown;
      }>;
};

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
    availabilityText:
      typeof offer?.availability === "string"
        ? offer.availability
        : typeof offer?.itemCondition === "string"
          ? offer.itemCondition
          : null,
    isbn: typeof product.isbn === "string" ? product.isbn : typeof product.sku === "string" ? product.sku : null,
    author: typeof product.brand?.name === "string" ? product.brand.name : null,
    notes: typeof product.description === "string" ? product.description : null,
  };
}

function listingsFromHtml(html: string): CandidateListing[] {
  const $ = cheerio.load(html);
  const cards: CandidateListing[] = [];

  $('a[href*="/products/"]').each((_, element) => {
    const linkNode = $(element);
    const root = linkNode.closest(".search__item__generic");
    if (root.length === 0) {
      return;
    }

    const rawText = root.text().replace(/\s+/g, " ").trim();
    const title = rawText.split("Rs.")[0]?.trim() ?? "";
    const link = linkNode.attr("href") ?? null;
    const availabilityText = rawText.match(/(Sold Out|Out of stock|Available)/i)?.[1] ?? null;

    if (title) {
      cards.push({
        title,
        productUrl: link ? new URL(link, "https://kitabay.com").toString() : null,
        priceInr: parseLowestPrice(rawText),
        availabilityText,
      });
    }
  });

  return cards;
}

export const kitabayScraper: StoreScraper = {
  store: "kitabay",
  async search(book: CanonicalBook): Promise<ScrapeResult> {
    const queries = [book.isbn13, book.title].filter(Boolean) as string[];

    for (const query of queries) {
      try {
        const url = `https://kitabay.com/search?q=${encodeURIComponent(query)}`;
        const html = await fetchText(url, "kitabay");
        const jsonLdListings = extractJsonLd(html)
          .map(productFromJsonLd)
          .filter((value): value is CandidateListing => !!value);
        const htmlListings = listingsFromHtml(html);

        const best = pickBestListing(book, [...jsonLdListings, ...htmlListings]);
        if (best) {
          return buildSuccessResult(book, "kitabay", best);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        if (message.startsWith("blocked:")) {
          return buildErrorResult(book, "kitabay", "blocked", "Kitabay blocked the scraper request");
        }
        if (message.startsWith("fetch_failed:")) {
          continue;
        }
        return buildErrorResult(book, "kitabay", "parse_error", `Kitabay parsing failed: ${message}`);
      }
    }

    return buildErrorResult(book, "kitabay", "not_found", "No Kitabay match found");
  },
};
