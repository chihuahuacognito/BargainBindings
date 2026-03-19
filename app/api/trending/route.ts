import { NextResponse } from "next/server";
import { getTrendingWithPrices, TRENDING_CATEGORIES } from "@/lib/trending";

export const runtime = "nodejs";

type Category = (typeof TRENDING_CATEGORIES)[number];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get("category") ?? "all";
    const category = TRENDING_CATEGORIES.includes(categoryParam as Category) ? (categoryParam as Category) : "all";
    const forceRefresh = searchParams.get("refresh") === "true";

    const books = await getTrendingWithPrices(category, forceRefresh);
    return NextResponse.json({ books, category });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trending fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
