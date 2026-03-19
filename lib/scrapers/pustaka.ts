import * as cheerio from "cheerio";
import type { CanonicalBook, ScrapeResult } from "@/lib/types";
import { fetchJson, fetchText } from "@/lib/http";
import {
  buildErrorResult,
  buildSuccessResult,
  parsePrice,
  pickBestListing,
  availabilityFromText,
  type CandidateListing,
  type StoreScraper,
} from "@/lib/scrapers/base";

interface PustakaProduct {
  title?: string;
  handle?: string;
  variants?: Array<{ price?: string; available?: boolean }>;
  tags?: string[];
}

interface PustakaSearchJson {
  results?: Array<{
    title?: string;
    url?: string;
    price?: string;
    description?: string;
  }>;
}

function listingsFromJson(data: PustakaSearchJson): CandidateListing[] {
  return (data.results ?? []).map((item) => ({
    title: item.title?.trim() ?? "",
    priceInr: item.price ? parsePrice(`₹${item.price}`) : null,
    productUrl: item.url ? new URL(item.url, "https://pustaka.in").toString() : null,
    availabilityText: "Available",
  })).filter((l) => l.title);
}

function listingsFromHtml(html: string): CandidateListing[] {
  const $ = cheerio.load(html);
  const listings: CandidateListing[] = [];

  $(".grid__item, .product-item, .product-card").each((_, el) => {
    const root = $(el);
    const titleEl = root.find(".grid-product__title, .product-title, h3, h4").first();
    const title = titleEl.text().trim();
    const href = root.find("a[href*='/products/']").first().attr("href") ?? null;
    const priceText = root.find(".product__price, .price, .grid-product__price").first().text().trim();
    const availText = root.find(".product__availability, .inventory").first().text().trim() || null;

    if (title && href) {
      listings.push({
        title,
        priceInr: parsePrice(priceText) ?? parsePrice(`₹${priceText.replace(/[^0-9.]/g, "")}`),
        productUrl: new URL(href, "https://pustaka.in").toString(),
        availabilityText: availText ?? "Available",
      });
    }
  });

  return listings;
}

export const pustakaScraper: StoreScraper = {
  store: "pustaka",
  async search(book: CanonicalBook): Promise<ScrapeResult> {
    const queries = [book.isbn13, `${book.title} ${book.authors[0] ?? ""}`.trim()].filter(Boolean) as string[];

    for (const query of queries) {
      try {
        // Try Shopify search JSON endpoint first
        const jsonUrl = `https://pustaka.in/search.json?q=${encodeURIComponent(query)}&type=product&limit=10`;
        try {
          const data = await fetchJson<{ results?: PustakaProduct[] }>(jsonUrl, "pustaka");
          const mappedResults: CandidateListing[] = (data.results ?? []).map((p) => ({
            title: p.title?.trim() ?? "",
            priceInr: p.variants?.[0]?.price ? parseFloat(p.variants[0].price) : null,
            productUrl: p.handle ? `https://pustaka.in/products/${p.handle}` : null,
            availabilityText: p.variants?.[0]?.available ? "In stock" : "Out of stock",
          })).filter((l) => l.title);

          const best = pickBestListing(book, mappedResults);
          if (best) return buildSuccessResult(book, "pustaka", best);
        } catch {
          // Fall through to HTML scraping
        }

        // HTML fallback
        const html = await fetchText(
          `https://pustaka.in/search?type=product&q=${encodeURIComponent(query)}`,
          "pustaka",
        );

        if (html.toLowerCase().includes("captcha") || html.toLowerCase().includes("blocked")) {
          return buildErrorResult(book, "pustaka", "blocked", "Pustaka.in blocked the request");
        }

        const listings = listingsFromHtml(html);
        const best = pickBestListing(book, listings);
        if (best) return buildSuccessResult(book, "pustaka", best);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        if (message.startsWith("blocked:")) {
          return buildErrorResult(book, "pustaka", "blocked", "Pustaka.in blocked the request");
        }
        if (message.startsWith("fetch_failed:")) continue;
        return buildErrorResult(book, "pustaka", "parse_error", `Pustaka.in parse error: ${message}`);
      }
    }

    return buildErrorResult(book, "pustaka", "not_found", "No Pustaka.in match found");
  },
};
