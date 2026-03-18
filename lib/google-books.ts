import { fetchJson } from "@/lib/http";
import type { SearchCandidate } from "@/lib/types";
import { buildBookId, normalizeIsbn } from "@/lib/utils";

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

  return {
    id: buildBookId(volume.id, isbn13, title),
    googleBooksId: volume.id,
    title,
    subtitle: volume.volumeInfo?.subtitle?.trim() ?? null,
    authors: volume.volumeInfo?.authors ?? [],
    isbn10,
    isbn13,
    publisher: volume.volumeInfo?.publisher?.trim() ?? null,
    thumbnail:
      volume.volumeInfo?.imageLinks?.thumbnail ??
      volume.volumeInfo?.imageLinks?.smallThumbnail ??
      null,
    description: volume.volumeInfo?.description?.trim() ?? null,
    publishedDate: volume.volumeInfo?.publishedDate?.trim() ?? null,
  };
}

export function mapGoogleVolume(volume: GoogleBooksVolume): SearchCandidate | null {
  return mapVolumeToCandidate(volume);
}

export async function searchGoogleBooks(query: string): Promise<SearchCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const params = new URLSearchParams({
    q: trimmed,
    maxResults: "8",
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

  return (payload.items ?? []).map(mapVolumeToCandidate).filter((value): value is SearchCandidate => !!value);
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
