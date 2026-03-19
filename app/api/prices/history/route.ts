import { NextResponse } from "next/server";
import { fetchGoogleBookById, searchGoogleBooks } from "@/lib/google-books";
import { getOfferHistory } from "@/lib/db";
import { isStoreName } from "@/lib/stores";
import type { CanonicalBook } from "@/lib/types";

export const runtime = "nodejs";

async function resolveBook(searchParams: URLSearchParams): Promise<CanonicalBook | null> {
  const googleBookId = searchParams.get("googleBookId")?.trim();
  const isbn = searchParams.get("isbn")?.trim();

  if (googleBookId) return fetchGoogleBookById(googleBookId);
  if (isbn) {
    const candidates = await searchGoogleBooks(`isbn:${isbn}`);
    return candidates[0] ?? null;
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storeParam = searchParams.get("store");
    const days = Math.min(90, Math.max(1, Number(searchParams.get("days") ?? "30")));

    const book = await resolveBook(searchParams);
    if (!book) {
      return NextResponse.json({ error: "Could not resolve book" }, { status: 400 });
    }

    const history = getOfferHistory(book.id, isStoreName(storeParam) ? storeParam : undefined, days);
    return NextResponse.json({ book, history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "History lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
