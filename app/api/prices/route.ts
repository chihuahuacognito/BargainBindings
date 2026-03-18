import { NextResponse } from "next/server";
import { fetchGoogleBookById, searchGoogleBooks } from "@/lib/google-books";
import { isStoreName } from "@/lib/stores";
import { getOffers } from "@/lib/store-offers";
import type { CanonicalBook } from "@/lib/types";

export const runtime = "nodejs";

async function resolveBook(searchParams: URLSearchParams): Promise<CanonicalBook | null> {
  const isbn = searchParams.get("isbn")?.trim();
  const googleBookId = searchParams.get("googleBookId")?.trim();

  if (!isbn && !googleBookId) {
    return null;
  }

  if (googleBookId) {
    return fetchGoogleBookById(googleBookId);
  }

  const candidates = await searchGoogleBooks(`isbn:${isbn}`);
  return candidates[0] ?? null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeParam = searchParams.get("store");
    const book = await resolveBook(searchParams);

    if (!book) {
      return NextResponse.json({ error: "Could not resolve a book for pricing" }, { status: 400 });
    }

    const offers = await getOffers({
      book,
      store: isStoreName(storeParam) ? storeParam : undefined,
    });

    return NextResponse.json({ book, offers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Price aggregation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
