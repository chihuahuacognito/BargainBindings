import * as cheerio from "cheerio";
import type { CanonicalBook, ScrapeResult } from "@/lib/types";
import { buildErrorResult, buildSuccessResult, parseLowestPrice, pickBestListing, type CandidateListing, type StoreScraper } from "@/lib/scrapers/base";

const FLIPKART_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchFlipkart(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": FLIPKART_UA,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": "en-IN,en-GB;q=0.9,en;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "upgrade-insecure-requests": "1",
        "cache-control": "max-age=0",
      },
      cache: "no-store",
    });

    if (response.status === 403 || response.status === 429) {
      throw new Error(`blocked:${response.status}`);
    }
    if (!response.ok) {
      throw new Error(`fetch_failed:${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function listingsFromHtml(html: string): CandidateListing[] {
  const $ = cheerio.load(html);
  const listings: CandidateListing[] = [];

  // Flipkart search result containers
  $("div[data-id], ._1AtVbE, ._13oc-S").each((_, el) => {
    const root = $(el);
    const titleEl = root.find("._4rR01T, .s1Q9rs, .IRpwTa, a[title]").first();
    const title = titleEl.text().trim() || titleEl.attr("title") || "";
    const href =
      root.find("a._1fQZEK, a.s1Q9rs, a._2rpwqI, a[href*='/p/itm']").first().attr("href") ?? null;
    const rawText = root.text().replace(/\s+/g, " ");

    if (title && href) {
      listings.push({
        title,
        priceInr: parseLowestPrice(rawText),
        productUrl: href.startsWith("http") ? href : `https://www.flipkart.com${href}`,
        availabilityText: rawText.match(/(out of stock|available|in stock)/i)?.[1] ?? null,
      });
    }
  });

  return listings;
}

export const flipkartScraper: StoreScraper = {
  store: "flipkart",
  async search(book: CanonicalBook): Promise<ScrapeResult> {
    const queries = [
      book.isbn13,
      `${book.title} ${book.authors[0] ?? ""} book`.trim(),
    ].filter(Boolean) as string[];

    for (const query of queries) {
      try {
        const url = `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&sort=relevance`;
        const html = await fetchFlipkart(url);

        // Detect reCAPTCHA or Cloudflare challenge
        if (
          html.includes("recaptcha") ||
          html.includes("captcha") ||
          html.includes("cf-challenge") ||
          html.includes("Just a moment")
        ) {
          return buildErrorResult(book, "flipkart", "blocked", "Flipkart returned a CAPTCHA challenge");
        }

        const listings = listingsFromHtml(html);
        const best = pickBestListing(book, listings);
        if (best) return buildSuccessResult(book, "flipkart", best);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        if (message.startsWith("blocked:") || message.startsWith("fetch_failed:403")) {
          return buildErrorResult(book, "flipkart", "blocked", "Flipkart blocked the scraper request");
        }
        if (message.startsWith("fetch_failed:")) continue;
        return buildErrorResult(book, "flipkart", "parse_error", `Flipkart lookup failed: ${message}`);
      }
    }

    return buildErrorResult(book, "flipkart", "not_found", "No Flipkart match found");
  },
};
