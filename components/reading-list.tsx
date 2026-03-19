"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { PenLine, Trash2, X } from "lucide-react";
import { STORE_LABELS } from "@/lib/stores";
import type { ReadingListEntry, ReadingShelf } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { CsvImportModal } from "@/components/csv-import-modal";

type ShelfFilter = ReadingShelf | "all";

const SHELF_LABELS: Record<ShelfFilter, string> = {
  all: "All",
  "to-read": "To Read",
  reading: "Reading",
  read: "Read",
};

export function ReadingList({
  open,
  onClose,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
}) {
  const [shelf, setShelf] = useState<ShelfFilter>("all");
  const [entries, setEntries] = useState<ReadingListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [notesValue, setNotesValue] = useState("");
  const [movingShelf, setMovingShelf] = useState<number | null>(null);
  const [savingNotes, setSavingNotes] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const url = shelf === "all" ? "/api/reading-list" : `/api/reading-list?shelf=${shelf}`;
      const res = await fetch(url);
      const data = (await res.json()) as { entries?: ReadingListEntry[] };
      setEntries(data.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, [shelf]);

  useEffect(() => {
    if (open) void fetchList();
  }, [open, fetchList]);

  async function handleShelfMove(id: number, newShelf: ReadingShelf) {
    setMovingShelf(id);
    try {
      await fetch(`/api/reading-list/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shelf: newShelf }),
      });
      void fetchList();
    } finally {
      setMovingShelf(null);
    }
  }

  async function handleRemove(id: number) {
    await fetch(`/api/reading-list/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleSaveNotes(id: number) {
    setSavingNotes(id);
    try {
      await fetch(`/api/reading-list/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: notesValue || null }),
      });
      setEditingNotes(null);
      void fetchList();
    } finally {
      setSavingNotes(null);
    }
  }

  const displayTitle = (entry: ReadingListEntry) => entry.title ?? entry.rawTitle ?? "Unknown title";
  const displayAuthors = (entry: ReadingListEntry) =>
    entry.authors.length > 0 ? entry.authors.join(", ") : entry.rawAuthor ?? "Unknown author";

  return (
    <>
      {open && <div className="rl-backdrop" onClick={onClose} />}
      <aside className={`rl-panel${open ? " rl-open" : ""}`}>
        <div className="rl-header">
          <div>
            <h2 className="rl-title">My Books</h2>
            <p className="rl-subtitle muted">{entries.length} book{entries.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="rl-header-actions">
            <button className="secondary-button small" onClick={() => setShowImport(true)}>
              Import CSV
            </button>
            <button className="rl-close" onClick={onClose} aria-label="Close"><X size={14} strokeWidth={2} /></button>
          </div>
        </div>

        <div className="rl-shelf-tabs">
          {(["all", "to-read", "reading", "read"] as ShelfFilter[]).map((s) => (
            <button
              key={s}
              className={`rl-tab${shelf === s ? " rl-tab-active" : ""}`}
              onClick={() => setShelf(s)}
            >
              {SHELF_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="rl-body">
          {loading ? (
            <ul className="rl-list">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="skeleton-rl-card">
                  <div className="skel skel-rl-thumb" />
                  <div className="skel-rl-lines">
                    <div className="skel skel-rl-line" />
                    <div className="skel skel-rl-line-s" />
                    <div className="skel skel-rl-line" style={{ width: "80%" }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : entries.length === 0 ? (
            <div className="rl-empty">
              <p>No books on this shelf yet.</p>
              <p className="muted">
                Search for a book and click &ldquo;Add to list&rdquo;, or import a CSV.
              </p>
            </div>
          ) : (
            <ul className="rl-list">
              {entries.map((entry) => (
                <li key={entry.id} className="rl-card">
                  <div className="rl-card-top">
                    {entry.thumbnail ? (
                      <Image
                        src={entry.thumbnail}
                        alt={displayTitle(entry)}
                        width={48}
                        height={68}
                        className="rl-thumb"
                        unoptimized
                      />
                    ) : (
                      <div className="rl-thumb rl-thumb-empty" />
                    )}
                    <div className="rl-card-meta">
                      <strong className="rl-book-title">{displayTitle(entry)}</strong>
                      <span className="muted">{displayAuthors(entry)}</span>
                      {entry.bestPriceInr !== null && entry.bestPriceStore ? (
                        <span className="rl-best-price">
                          Best: {formatCurrency(entry.bestPriceInr, "INR")} on{" "}
                          {STORE_LABELS[entry.bestPriceStore]}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="rl-card-actions">
                    <div className="btn-inner">
                      <select
                        className="rl-shelf-select"
                        value={entry.shelf}
                        disabled={movingShelf === entry.id}
                        onChange={(e) => void handleShelfMove(entry.id, e.target.value as ReadingShelf)}
                      >
                        <option value="to-read">To Read</option>
                        <option value="reading">Reading</option>
                        <option value="read">Read</option>
                      </select>
                      {movingShelf === entry.id && <span className="spinner spinner-sm" />}
                    </div>

                    <button
                      className="secondary-button small"
                      onClick={() => {
                        const query = entry.isbn13 ?? entry.isbn10 ?? displayTitle(entry);
                        onSearch(query);
                        onClose();
                      }}
                    >
                      View prices
                    </button>

                    {editingNotes === entry.id ? (
                      <div className="rl-notes-edit">
                        <textarea
                          className="rl-notes-input"
                          value={notesValue}
                          onChange={(e) => setNotesValue(e.target.value)}
                          rows={2}
                          placeholder="Notes..."
                        />
                        <div className="rl-notes-btns">
                          <button
                            className="primary-button small"
                            disabled={savingNotes === entry.id}
                            onClick={() => void handleSaveNotes(entry.id)}
                          >
                            <span className="btn-inner">
                              {savingNotes === entry.id && <span className="spinner spinner-sm" />}
                              {savingNotes === entry.id ? "Saving…" : "Save"}
                            </span>
                          </button>
                          <button className="secondary-button small" onClick={() => setEditingNotes(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="secondary-button small"
                        onClick={() => {
                          setEditingNotes(entry.id);
                          setNotesValue(entry.notes ?? "");
                        }}
                      >
                        <span className="icon-btn-inner">
                          <PenLine size={11} strokeWidth={2} />
                          {entry.notes ? "Edit notes" : "Add notes"}
                        </span>
                      </button>
                    )}

                    {entry.notes && editingNotes !== entry.id ? (
                      <p className="rl-notes-preview muted">{entry.notes}</p>
                    ) : null}

                    <button
                      className="rl-remove"
                      onClick={() => void handleRemove(entry.id)}
                      aria-label="Remove from list"
                    >
                      <span className="icon-btn-inner"><Trash2 size={11} strokeWidth={2} />Remove</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {showImport && (
        <CsvImportModal
          onClose={() => setShowImport(false)}
          onImportComplete={() => {
            setShowImport(false);
            void fetchList();
          }}
        />
      )}
    </>
  );
}
