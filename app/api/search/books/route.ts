import { NextResponse } from "next/server";
import { searchGoogleBooks } from "@/lib/google-books";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json({ candidates: [] });
  }

  try {
    const candidates = await searchGoogleBooks(query);
    return NextResponse.json({ candidates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Books request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
