import { NextResponse } from "next/server";
import { addToReadingList, upsertBook } from "@/lib/db";
import { searchGoogleBooks } from "@/lib/google-books";
import { scoreCandidate } from "@/lib/utils";
import type { ReadingShelf, SearchCandidate } from "@/lib/types";

export const runtime = "nodejs";

interface ImportRow {
  title: string;
  author?: string;
  isbn?: string;
  shelf?: string;
}

interface ImportResult {
  row: ImportRow;
  book?: SearchCandidate;
  added: boolean;
  alreadyExists: boolean;
  unmatched: boolean;
}

async function resolveRow(row: ImportRow): Promise<SearchCandidate | null> {
  // Try ISBN first (most precise)
  if (row.isbn) {
    const byIsbn = await searchGoogleBooks(`isbn:${row.isbn.replace(/[^0-9X]/gi, "")}`);
    if (byIsbn.length > 0) return byIsbn[0]!;
  }

  // Fall back to title + author query
  const query = [row.title, row.author].filter(Boolean).join(" ");
  const results = await searchGoogleBooks(query);
  if (results.length === 0) return null;

  // Score candidates and pick best if above threshold
  const scored = results.map((candidate) => ({
    candidate,
    score: scoreCandidate({
      book: { id: "", googleBooksId: "", title: row.title, authors: row.author ? [row.author] : [], isbn10: null, isbn13: row.isbn ?? null, publisher: null, thumbnail: null },
      candidateTitle: candidate.title,
      candidateIsbn: candidate.isbn13 ?? candidate.isbn10,
      candidateAuthor: candidate.authors[0],
    }),
  }));

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  return best && best.score >= 20 ? best.candidate : null;
}

function mapShelf(raw?: string): ReadingShelf {
  if (!raw) return "to-read";
  const normalized = raw.toLowerCase().trim();
  if (normalized === "currently-reading" || normalized === "reading") return "reading";
  if (normalized === "read") return "read";
  return "to-read";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rows: ImportRow[] };
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: "rows array required" }, { status: 400 });
    }

    const rows = body.rows.slice(0, 100); // cap at 100 per import
    const results: ImportResult[] = [];

    for (const row of rows) {
      if (!row.title?.trim()) {
        results.push({ row, added: false, alreadyExists: false, unmatched: true });
        continue;
      }

      const book = await resolveRow(row);

      if (!book) {
        results.push({ row, added: false, alreadyExists: false, unmatched: true });
        continue;
      }

      upsertBook(book);
      const id = addToReadingList({
        googleBookId: book.googleBooksId,
        bookId: book.id,
        shelf: mapShelf(row.shelf),
        rawTitle: row.title,
        rawAuthor: row.author ?? null,
        rawIsbn: row.isbn ?? null,
      });

      results.push({
        row,
        book,
        added: id !== null,
        alreadyExists: id === null,
        unmatched: false,
      });
    }

    const matched = results.filter((r) => !r.unmatched).length;
    const added = results.filter((r) => r.added).length;
    const unmatched = results.filter((r) => r.unmatched).length;
    const alreadyExisted = results.filter((r) => r.alreadyExists).length;

    return NextResponse.json({ matched, added, unmatched, alreadyExisted, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
