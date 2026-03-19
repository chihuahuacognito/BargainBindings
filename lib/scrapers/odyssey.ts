import * as cheerio from "cheerio";
import type { CanonicalBook, ScrapeResult } from "@/lib/types";
import { fetchText } from "@/lib/http";
import {
  buildErrorResult,
  buildSuccessResult,
  extractJsonLd,
  parsePrice,
  pickBestListing,
  type CandidateListing,
  type StoreScraper,
} from "@/lib/scrapers/base";

interface JsonLdProduct {
  "@type"?: string;
  name?: string;
  url?: string;
  offers?: { price?: string | number; availability?: string } | Array<{ price?: string | number; availability?: string }>;
  isbn?: string;
  author?: { name?: string } | string;
}

function listingsFromJsonLd(html: string): CandidateListing[] {
  const entries = extractJsonLd(html) as JsonLdProduct[];
  return entries
    .filter((e) => e["@type"] === "Product" || e["@type"] === "Book")
    .map((e) => {
      const offer = Array.isArray(e.offers) ? e.offers[0] : e.offers;
      const price = offer?.price !== undefined ? parseFloat(String(offer.price)) : null;
      const availability = offer?.availability ?? null;
      const authorName =
        typeof e.author === "object" ? e.author?.name : (e.author as string | undefined);
      return {
        title: e.name?.trim() ?? "",
        priceInr: price && !isNaN(price) ? price : null,
        productUrl: e.url ?? null,
        availabilityText: availability ?? (price ? "Available" : null),
        isbn: e.isbn ?? null,
        author: authorName ?? null,
      };
    })
    .filter((l) => l.title);
}

function listingsFromHtml(html: string): CandidateListing[] {
  const $ = cheerio.load(html);
  const listings: CandidateListing[] = [];

  // OdysseyIndia uses various product card classes
  $(".product-card, .book-card, .product-item, .item, .grid-item").each((_, el) => {
    const root = $(el);
    const titleEl = root.find("h3, h4, .product-title, .book-title, .title").first();
    const title = titleEl.text().trim();
    const href =
      root.find("a[href*='/product'], a[href*='/book'], a[href*='/catalogue']").first().attr("href") ??
      root.find("a").first().attr("href") ??
      null;
    const priceText = root.find(".price, .product-price, .book-price, [class*='price']").first().text().trim();
    const availText = root.find("[class*='stock'], [class*='avail']").first().text().trim() || null;

    if (title && href) {
      listings.push({
        title,
        priceInr: parsePrice(priceText),
        productUrl: href.startsWith("http") ? href : new URL(href, "https://www.odysseyindia.com").toString(),
        availabilityText: availText ?? (priceText ? "Available" : null),
      });
    }
  });

  return listings;
}

export const odysseyScraper: StoreScraper = {
  store: "odyssey",
  async search(book: CanonicalBook): Promise<ScrapeResult> {
    const queries = [book.isbn13, `${book.title} ${book.authors[0] ?? ""}`.trim()].filter(Boolean) as string[];

    for (const query of queries) {
      try {
        const url = `https://www.odysseyindia.com/search?q=${encodeURIComponent(query)}`;
        const html = await fetchText(url, "odyssey");

        if (html.toLowerCase().includes("captcha") || html.toLowerCase().includes("access denied")) {
          return buildErrorResult(book, "odyssey", "blocked", "OdysseyIndia blocked the request");
        }

        // Try JSON-LD first
        const jsonLdListings = listingsFromJsonLd(html);
        const best = pickBestListing(book, jsonLdListings);
        if (best) return buildSuccessResult(book, "odyssey", best);

        // Fall back to HTML parsing
        const htmlListings = listingsFromHtml(html);
        const bestHtml = pickBestListing(book, htmlListings);
        if (bestHtml) return buildSuccessResult(book, "odyssey", bestHtml);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        if (message.startsWith("blocked:")) {
          return buildErrorResult(book, "odyssey", "blocked", "OdysseyIndia blocked the request");
        }
        if (message.startsWith("fetch_failed:")) continue;
        return buildErrorResult(book, "odyssey", "parse_error", `OdysseyIndia parse error: ${message}`);
      }
    }

    return buildErrorResult(book, "odyssey", "not_found", "No OdysseyIndia match found");
  },
};
