import { getLatestTrendingScrapeTime, getTrendingBooks, upsertTrendingBooks, upsertBook } from "@/lib/db";
import { searchGoogleBooks } from "@/lib/google-books";
import {
  fetchOpenLibraryTrending,
  classifySubjects,
  type TrendingRawBook,
} from "@/lib/scrapers/openlibrary-trending";
import { scoreCandidate, normalizeIsbn } from "@/lib/utils";
import type { TrendingBook } from "@/lib/types";
import curatedData from "@/data/curated-trending.json";

export const TRENDING_CATEGORIES = ["all", "fiction", "nonfiction", "self-help", "academic"] as const;
export type TrendingCategory = (typeof TRENDING_CATEGORIES)[number];

interface CuratedEntry {
  title: string;
  author: string;
  isbn13?: string;
  category: string;
}

function isFresh(category: string, maxAgeHours = 12): boolean {
  const lastScrape = getLatestTrendingScrapeTime(category);
  if (!lastScrape) return false;
  return Date.now() - new Date(lastScrape).getTime() < maxAgeHours * 3_600_000;
}

async function resolveBook(title: string, author: string | null, isbn: string | null) {
  if (isbn) {
    const byIsbn = await searchGoogleBooks(`isbn:${isbn.replace(/[^0-9X]/gi, "")}`);
    if (byIsbn.length > 0) return byIsbn[0]!;
  }

  const query = [title, author].filter(Boolean).join(" ");
  const results = await searchGoogleBooks(query);
  if (results.length === 0) return null;

  const scored = results.map((c) => ({
    c,
    score: scoreCandidate({
      book: {
        id: "", googleBooksId: "", title,
        authors: author ? [author] : [],
        isbn10: null, isbn13: normalizeIsbn(isbn),
        publisher: null, thumbnail: null,
      },
      candidateTitle: c.title,
      candidateIsbn: c.isbn13 ?? c.isbn10,
      candidateAuthor: c.authors[0],
    }),
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.score >= 20 ? best.c : null;
}

function filterForCategory(books: TrendingRawBook[], category: TrendingCategory): TrendingRawBook[] {
  if (category === "all") return books.slice(0, 20);
  return books.filter((b) => classifySubjects(b.subjects) === category).slice(0, 20);
}

function curatedForCategory(category: TrendingCategory): TrendingRawBook[] {
  const entries = (curatedData as CuratedEntry[]).filter(
    (e) => category === "all" || e.category === category,
  );
  return entries.map((e, i) => ({
    rank: i + 1,
    title: e.title,
    author: e.author,
    isbn: e.isbn13 ?? null,
    openLibraryCoverId: null,
    subjects: [e.category],
  }));
}

export async function refreshTrending(category: TrendingCategory = "all"): Promise<void> {
  const olBooks = await fetchOpenLibraryTrending("weekly");

  let rawBooks = filterForCategory(olBooks, category);

  // Pad with curated seed if Open Library returned too few for this category
  if (rawBooks.length < 8) {
    const curated = curatedForCategory(category);
    const olTitles = new Set(rawBooks.map((b) => b.title.toLowerCase()));
    const extra = curated.filter((c) => !olTitles.has(c.title.toLowerCase()));
    rawBooks = [...rawBooks, ...extra].slice(0, 20);
  }

  // Re-rank sequentially after merging
  rawBooks = rawBooks.slice(0, 20).map((b, i) => ({ ...b, rank: i + 1 }));

  const resolved: Array<{
    rank: number;
    category: string;
    googleBookId: string | null;
    bookId: string | null;
    rawTitle: string;
    rawAuthor: string | null;
    rawIsbn: string | null;
  }> = [];

  for (const raw of rawBooks) {
    try {
      const book = await resolveBook(raw.title, raw.author, raw.isbn);
      if (book) upsertBook(book);
      resolved.push({
        rank: raw.rank,
        category,
        googleBookId: book?.googleBooksId ?? null,
        bookId: book?.id ?? null,
        rawTitle: raw.title,
        rawAuthor: raw.author,
        rawIsbn: raw.isbn,
      });
    } catch {
      resolved.push({
        rank: raw.rank,
        category,
        googleBookId: null,
        bookId: null,
        rawTitle: raw.title,
        rawAuthor: raw.author,
        rawIsbn: raw.isbn,
      });
    }
  }

  upsertTrendingBooks(resolved);
}

export async function getTrendingWithPrices(
  category: string = "all",
  forceRefresh = false,
): Promise<TrendingBook[]> {
  const cat = (TRENDING_CATEGORIES.includes(category as TrendingCategory)
    ? category
    : "all") as TrendingCategory;

  if (forceRefresh || !isFresh(cat)) {
    await refreshTrending(cat);
  }

  return getTrendingBooks(cat, 20);
}
