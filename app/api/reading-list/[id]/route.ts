import { NextResponse } from "next/server";
import { removeFromReadingList, updateReadingListEntry } from "@/lib/db";
import type { ReadingShelf } from "@/lib/types";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entryId = Number(id);
    if (!Number.isFinite(entryId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = (await request.json()) as {
      shelf?: ReadingShelf;
      notes?: string | null;
      targetPrice?: number | null;
      dateStarted?: string | null;
      dateFinished?: string | null;
    };

    updateReadingListEntry(entryId, body);
    return NextResponse.json({ updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entryId = Number(id);
    if (!Number.isFinite(entryId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    removeFromReadingList(entryId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
