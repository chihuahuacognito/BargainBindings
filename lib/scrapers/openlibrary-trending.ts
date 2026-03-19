import { fetchJson } from "@/lib/http";

export interface TrendingRawBook {
  rank: number;
  title: string;
  author: string | null;
  isbn: string | null;
  openLibraryCoverId: number | null;
  subjects: string[];
}

interface OLWork {
  title?: string;
  author_name?: string[];
  isbn?: string[];
  cover_i?: number;
  subject?: string[];
  key?: string;
}

interface OLTrendingResponse {
  works?: OLWork[];
}

// Keyword sets for category classification based on OL subject strings
const SUBJECT_KEYWORDS: Record<string, string[]> = {
  fiction: [
    "fiction", "novel", "fantasy", "science fiction", "mystery", "thriller",
    "romance", "horror", "adventure", "literary fiction", "short stories",
  ],
  nonfiction: [
    "history", "biography", "memoir", "autobiography", "politics", "economics",
    "journalism", "true crime", "travel", "science", "nature", "philosophy",
    "nonfiction", "non-fiction",
  ],
  "self-help": [
    "self-help", "personal development", "motivation", "success", "leadership",
    "productivity", "psychology", "mental health", "well-being", "spirituality",
    "mindfulness", "business",
  ],
  academic: [
    "textbooks", "education", "mathematics", "engineering", "computer science",
    "medicine", "physics", "chemistry", "biology", "law", "academic",
  ],
};

export function classifySubjects(subjects: string[]): string | null {
  const normalized = subjects.map((s) => s.toLowerCase());
  for (const [category, keywords] of Object.entries(SUBJECT_KEYWORDS)) {
    if (keywords.some((kw) => normalized.some((s) => s.includes(kw)))) {
      return category;
    }
  }
  return null;
}

function pickIsbn(isbns: string[]): string | null {
  // Prefer ISBN-13 (starts with 978 or 979, 13 digits)
  const isbn13 = isbns.find((i) => /^97[89]\d{10}$/.test(i.replace(/[^0-9]/g, "")));
  if (isbn13) return isbn13.replace(/[^0-9]/g, "");
  // Fall back to ISBN-10
  const isbn10 = isbns.find((i) => /^\d{9}[\dX]$/i.test(i.replace(/[^0-9X]/gi, "")));
  if (isbn10) return isbn10.replace(/[^0-9X]/gi, "");
  return null;
}

export async function fetchOpenLibraryTrending(period: "now" | "weekly" = "weekly"): Promise<TrendingRawBook[]> {
  const url = `https://openlibrary.org/trending/${period}.json`;

  try {
    const data = await fetchJson<OLTrendingResponse>(url, "openlibrary-trending");
    const works = data.works ?? [];

    return works
      .map((work, index): TrendingRawBook => ({
        rank: index + 1,
        title: work.title?.trim() ?? "",
        author: work.author_name?.[0] ?? null,
        isbn: work.isbn ? pickIsbn(work.isbn) : null,
        openLibraryCoverId: work.cover_i ?? null,
        subjects: work.subject ?? [],
      }))
      .filter((b) => b.title.length > 0)
      .slice(0, 50); // take top 50 to allow category filtering
  } catch {
    return [];
  }
}
