import * as cheerio from "cheerio";
import type { CanonicalBook, ScrapeResult, ScrapeStatus, StoreName, StoreOffer } from "@/lib/types";
import { fetchText } from "@/lib/http";
import { bestQueryForBook, normalizeIsbn, normalizeText, scoreCandidate } from "@/lib/utils";

const SCRAPE_VERSION = "v1";

export interface CandidateListing {
  title: string;
  priceInr: number | null;
  productUrl: string | null;
  availabilityText?: string | null;
  isbn?: string | null;
  author?: string | null;
  notes?: string | null;
}

export interface StoreScraper {
  store: StoreName;
  search(book: CanonicalBook): Promise<ScrapeResult>;
}

export function buildDefaultOffer(book: CanonicalBook, store: StoreName, status: ScrapeStatus): StoreOffer {
  return {
    bookId: book.id,
    store,
    status,
    productUrl: null,
    matchedTitle: null,
    matchedIsbn: null,
    priceInr: null,
    currency: "INR",
    availabilityStatus: "unknown",
    inStock: null,
    lastCheckedAt: new Date().toISOString(),
    rawStatusText: null,
    scrapeVersion: SCRAPE_VERSION,
    notes: null,
    sourceQuery: bestQueryForBook(book),
  };
}

export function availabilityFromText(
  text?: string | null,
): Pick<StoreOffer, "availabilityStatus" | "inStock" | "rawStatusText"> {
  const rawStatusText = text?.trim() ?? null;
  const normalized = normalizeText(text ?? "");

  if (!normalized) {
    return { availabilityStatus: "unknown", inStock: null, rawStatusText };
  }

  if (/(out of stock|unavailable|sold out)/.test(normalized)) {
    return { availabilityStatus: "out_of_stock", inStock: false, rawStatusText };
  }

  if (/(only|few|limited)/.test(normalized)) {
    return { availabilityStatus: "limited", inStock: true, rawStatusText };
  }

  if (/(in stock|available|ships|dispatch)/.test(normalized)) {
    return { availabilityStatus: "in_stock", inStock: true, rawStatusText };
  }

  return { availabilityStatus: "unknown", inStock: null, rawStatusText };
}

export function parsePrice(text?: string | null): number | null {
  if (!text) {
    return null;
  }

  const match = text.replace(/,/g, "").match(/(?:Rs\.?|INR|₹)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

export function parseLowestPrice(text?: string | null): number | null {
  if (!text) {
    return null;
  }

  const matches = [...text.replace(/,/g, "").matchAll(/(?:Rs\.?|INR|₹)\s*([0-9]+(?:\.[0-9]+)?)/gi)];
  if (matches.length === 0) {
    return null;
  }

  return Math.min(...matches.map((match) => Number(match[1])));
}

export function extractJsonLd(html: string): unknown[] {
  const $ = cheerio.load(html);
  const results: unknown[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).contents().text().trim();
    if (!text) {
      return;
    }

    try {
      results.push(JSON.parse(text));
    } catch {
      return;
    }
  });

  return results.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
}

export function pickBestListing(book: CanonicalBook, listings: CandidateListing[]): CandidateListing | null {
  const ranked = listings
    .map((listing) => ({
      listing,
      score: scoreCandidate({
        book,
        candidateTitle: listing.title,
        candidateIsbn: listing.isbn,
        candidateAuthor: listing.author,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  if (!best || best.score < 20) {
    return null;
  }

  return best.listing;
}

export async function fetchStoreDocument(url: string, store: StoreName): Promise<cheerio.CheerioAPI> {
  const html = await fetchText(url, store);
  return cheerio.load(html);
}

export function buildSuccessResult(book: CanonicalBook, store: StoreName, listing: CandidateListing): ScrapeResult {
  const availability = availabilityFromText(listing.availabilityText);

  return {
    offer: {
      bookId: book.id,
      store,
      status: "ok",
      productUrl: listing.productUrl,
      matchedTitle: listing.title,
      matchedIsbn: normalizeIsbn(listing.isbn),
      priceInr: listing.priceInr,
      currency: "INR",
      availabilityStatus: availability.availabilityStatus,
      inStock: availability.inStock,
      lastCheckedAt: new Date().toISOString(),
      rawStatusText: availability.rawStatusText,
      scrapeVersion: SCRAPE_VERSION,
      notes: listing.notes ?? null,
      sourceQuery: bestQueryForBook(book),
    },
    logMessage: `Matched "${listing.title}"`,
  };
}

export function buildErrorResult(book: CanonicalBook, store: StoreName, status: ScrapeStatus, message: string): ScrapeResult {
  return {
    offer: buildDefaultOffer(book, store, status),
    logMessage: message,
  };
}
