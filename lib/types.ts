export type EditionType =
  | "audiobook"
  | "ebook"
  | "box-set"
  | "illustrated"
  | "hardcover"
  | "mass-market"
  | "trade-paperback"
  | "paperback"
  | "unknown";

export const EDITION_LABELS: Record<EditionType, string> = {
  audiobook:        "Audiobook",
  ebook:            "E-Book",
  "box-set":        "Box Set",
  illustrated:      "Illustrated",
  hardcover:        "Hardcover",
  "mass-market":    "Mass Market PB",
  "trade-paperback":"Trade Paperback",
  paperback:        "Paperback",
  unknown:          "",
};

export type StoreName =
  | "amazon"
  | "flipkart"
  | "crossword"
  | "sapnaonline"
  | "bookchor"
  | "bookswagon"
  | "gyaanstore"
  | "kitabay"
  | "pustaka"
  | "odyssey";

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
  editionType: EditionType;
}

export interface ScrapeResult {
  offer: StoreOffer;
  logMessage: string;
}

export interface PriceHistoryPoint {
  store: StoreName;
  priceInr: number | null;
  inStock: boolean | null;
  checkedAt: string;
}

export type ReadingShelf = "to-read" | "reading" | "read";

export interface ReadingListEntry {
  id: number;
  shelf: ReadingShelf;
  dateAdded: string;
  dateStarted: string | null;
  dateFinished: string | null;
  notes: string | null;
  targetPrice: number | null;
  rawTitle: string | null;
  rawAuthor: string | null;
  rawIsbn: string | null;
  googleBookId: string | null;
  bookId: string | null;
  title: string | null;
  authors: string[];
  isbn13: string | null;
  isbn10: string | null;
  thumbnail: string | null;
  publisher: string | null;
  bestPriceInr: number | null;
  bestPriceStore: StoreName | null;
}

export interface TrendingBook {
  rank: number;
  category: string;
  rawTitle: string;
  rawAuthor: string | null;
  googleBookId: string | null;
  bookId: string | null;
  scrapedAt: string;
  title: string | null;
  authors: string[];
  thumbnail: string | null;
  isbn13: string | null;
  bestPriceInr: number | null;
  bestPriceStore: StoreName | null;
}
