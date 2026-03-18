export type StoreName =
  | "amazon"
  | "flipkart"
  | "crossword"
  | "sapnaonline"
  | "bookchor"
  | "bookswagon"
  | "gyaanstore"
  | "kitabay";

export type ScrapeStatus =
  | "ok"
  | "not_found"
  | "ambiguous_match"
  | "blocked"
  | "parse_error";

export type AvailabilityStatus =
  | "in_stock"
  | "out_of_stock"
  | "limited"
  | "unknown";

export interface CanonicalBook {
  id: string;
  googleBooksId: string;
  title: string;
  authors: string[];
  isbn10: string | null;
  isbn13: string | null;
  publisher: string | null;
  thumbnail: string | null;
}

export interface StoreOffer {
  bookId: string;
  store: StoreName;
  status: ScrapeStatus;
  productUrl: string | null;
  matchedTitle: string | null;
  matchedIsbn: string | null;
  priceInr: number | null;
  currency: string | null;
  availabilityStatus: AvailabilityStatus;
  inStock: boolean | null;
  lastCheckedAt: string;
  rawStatusText: string | null;
  scrapeVersion: string;
  notes: string | null;
  sourceQuery: string | null;
}

export interface SearchCandidate extends CanonicalBook {
  subtitle: string | null;
  publishedDate: string | null;
  description: string | null;
}

export interface ScrapeResult {
  offer: StoreOffer;
  logMessage: string;
}
