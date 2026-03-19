import { fetchJson } from "@/lib/http";
import type { SearchCandidate } from "@/lib/types";
import { buildBookId, detectEditionType, normalizeIsbn, normalizeText } from "@/lib/utils";

interface GoogleBooksVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    description?: string;
    publishedDate?: string;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
  };
}

interface GoogleBooksResponse {
  items?: GoogleBooksVolume[];
}

function mapVolumeToCandidate(volume: GoogleBooksVolume): SearchCandidate | null {
  const title = volume.volumeInfo?.title?.trim();
  if (!title) {
    return null;
  }

  const identifiers = volume.volumeInfo?.industryIdentifiers ?? [];
  const isbn10 = normalizeIsbn(
    identifiers.find((entry) => entry.type === "ISBN_10")?.identifier ?? null,
  );
  const isbn13 = normalizeIsbn(
    identifiers.find((entry) => entry.type === "ISBN_13")?.identifier ?? null,
  );

  const subtitle = volume.volumeInfo?.subtitle?.trim() ?? null;
  const publisher = volume.volumeInfo?.publisher?.trim() ?? null;

  return {
    id: buildBookId(volume.id, isbn13, title),
    googleBooksId: volume.id,
    title,
    subtitle,
    authors: volume.volumeInfo?.authors ?? [],
    isbn10,
    isbn13,
    publisher,
    thumbnail:
      volume.volumeInfo?.imageLinks?.thumbnail ??
      volume.volumeInfo?.imageLinks?.smallThumbnail ??
      null,
    description: volume.volumeInfo?.description?.trim() ?? null,
    publishedDate: volume.volumeInfo?.publishedDate?.trim() ?? null,
    editionType: detectEditionType(title, subtitle, publisher),
  };
}

export function mapGoogleVolume(volume: GoogleBooksVolume): SearchCandidate | null {
  return mapVolumeToCandidate(volume);
}

/** Score a candidate against the raw user query. Higher = better match. */
function scoreAgainstQuery(candidate: SearchCandidate, rawQuery: string): number {
  const q = normalizeText(rawQuery);
  const words = q.split(" ").filter((w) => w.length > 1);
  const title = normalizeText(candidate.title);
  const authorText = candidate.authors.map((a) => normalizeText(a)).join(" ");
  const isbnQuery = normalizeIsbn(rawQuery);

  let score = 0;

  // ISBN exact match — always wins
  if (isbnQuery) {
    if (isbnQuery === candidate.isbn13 || isbnQuery === candidate.isbn10) score += 200;
    return score;
  }

  // Title is an exact match of the full query
  if (title === q) {
    score += 100;
  } else if (title.startsWith(q)) {
    // Query is a prefix of the title (e.g. "1984" matches "1984" exactly)
    score += 80;
  } else if (title.includes(q)) {
    score += 60;
  } else {
    // All query words appear in the title
    if (words.every((w) => title.includes(w))) score += 45;
    // At least half the query words appear in the title
    else if (words.filter((w) => title.includes(w)).length >= Math.ceil(words.length / 2)) score += 20;
  }

  // Author match for any query word (helps "1984 Orwell" surface Orwell's book)
  const matchingAuthorWords = words.filter((w) => w.length > 3 && authorText.includes(w));
  score += matchingAuthorWords.length * 15;

  return score;
}

/** Fetch raw volumes from Google Books for a given query string. */
async function fetchVolumes(queryString: string, maxResults = 10): Promise<GoogleBooksVolume[]> {
  const params = new URLSearchParams({
    q: queryString,
    maxResults: String(maxResults),
    projection: "lite",
    country: "IN",
    langRestrict: "en",
    printType: "books",
  });

  if (process.env.GOOGLE_BOOKS_API_KEY?.trim()) {
    params.set("key", process.env.GOOGLE_BOOKS_API_KEY.trim());
  }

  const url = `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
  const payload = await fetchJson<GoogleBooksResponse>(url, "google-books");
  return payload.items ?? [];
}

export async function searchGoogleBooks(query: string): Promise<SearchCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const isbnQuery = normalizeIsbn(trimmed);
  const words = trimmed.trim().split(/\s+/);

  let volumes: GoogleBooksVolume[];

  if (isbnQuery) {
    // Precise ISBN lookup
    volumes = await fetchVolumes(`isbn:${isbnQuery}`);
  } else if (words.length <= 2) {
    // Short query: intitle: gives the most relevant results for 1-2 word searches
    volumes = await fetchVolumes(`intitle:${trimmed}`, 10);
  } else {
    // Multi-word query: plain search covers author + title combinations
    volumes = await fetchVolumes(trimmed, 10);
  }

  const candidates = volumes
    .map(mapVolumeToCandidate)
    .filter((c): c is SearchCandidate => !!c);

  // Re-rank by relevance to the user's actual query
  return candidates
    .map((c) => ({ c, score: scoreAgainstQuery(c, trimmed) }))
    .sort((a, b) => b.score - a.score)
    .map(({ c }) => c)
    .slice(0, 8);
}

export async function fetchGoogleBookById(volumeId: string): Promise<SearchCandidate | null> {
  const trimmed = volumeId.trim();
  if (!trimmed) {
    return null;
  }

  const params = new URLSearchParams();
  if (process.env.GOOGLE_BOOKS_API_KEY?.trim()) {
    params.set("key", process.env.GOOGLE_BOOKS_API_KEY.trim());
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const url = `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(trimmed)}${suffix}`;
  const payload = await fetchJson<GoogleBooksVolume>(url, "google-books");
  return mapVolumeToCandidate(payload);
}
