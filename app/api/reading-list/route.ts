import { NextResponse } from "next/server";
import { addToReadingList, getReadingList, upsertBook } from "@/lib/db";
import { fetchGoogleBookById } from "@/lib/google-books";
import type { ReadingShelf } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shelfParam = searchParams.get("shelf");
    const validShelves: ReadingShelf[] = ["to-read", "reading", "read"];
    const shelf = validShelves.includes(shelfParam as ReadingShelf) ? (shelfParam as ReadingShelf) : undefined;

    const entries = getReadingList(shelf);
    return NextResponse.json({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load reading list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      googleBookId?: string;
      bookId?: string;
      shelf?: ReadingShelf;
      rawTitle?: string;
      rawAuthor?: string;
      rawIsbn?: string;
    };

    if (!body.googleBookId && !body.rawTitle) {
      return NextResponse.json({ error: "googleBookId or rawTitle required" }, { status: 400 });
    }

    // If we have a googleBookId, make sure the book is in the DB
    if (body.googleBookId) {
      const book = await fetchGoogleBookById(body.googleBookId);
      if (book) {
        upsertBook(book);
        const id = addToReadingList({
          googleBookId: book.googleBooksId,
          bookId: body.bookId ?? book.id,
          shelf: body.shelf ?? "to-read",
        });
        if (id === null) {
          return NextResponse.json({ alreadyExists: true });
        }
        return NextResponse.json({ id, added: true });
      }
    }

    const id = addToReadingList({
      googleBookId: body.googleBookId ?? null,
      bookId: body.bookId ?? null,
      shelf: body.shelf ?? "to-read",
      rawTitle: body.rawTitle ?? null,
      rawAuthor: body.rawAuthor ?? null,
      rawIsbn: body.rawIsbn ?? null,
    });

    if (id === null) {
      return NextResponse.json({ alreadyExists: true });
    }

    return NextResponse.json({ id, added: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add to reading list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
