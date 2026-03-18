import { NextResponse } from "next/server";
import { fetchGoogleBookById, searchGoogleBooks } from "@/lib/google-books";
import { isStoreName } from "@/lib/stores";
import { getOffers } from "@/lib/store-offers";
import type { CanonicalBook } from "@/lib/types";

export const runtime = "nodejs";

async function resolveBook(body: { isbn?: string; googleBookId?: string }): Promise<CanonicalBook | null> {
  if (body.googleBookId?.trim()) {
    return fetchGoogleBookById(body.googleBookId);
  }

  const isbn = body.isbn?.trim();
  if (!isbn) {
    return null;
  }

  const candidates = await searchGoogleBooks(`isbn:${isbn}`);
  return candidates[0] ?? null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { isbn?: string; googleBookId?: string; store?: string };
    const book = await resolveBook(body);

    if (!book) {
      return NextResponse.json({ error: "Could not resolve a book for refresh" }, { status: 400 });
    }

    const offers = await getOffers({
      book,
      forceRefresh: true,
      store: isStoreName(body.store) ? body.store : undefined,
    });

    return NextResponse.json({ book, offers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
