"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";

interface ParsedRow {
  title: string;
  author?: string;
  isbn?: string;
  shelf?: string;
}

interface ImportResult {
  matched: number;
  added: number;
  unmatched: number;
  alreadyExisted: number;
}

type Step = "pick" | "preview" | "importing" | "done";

function detectColumns(headers: string[]): {
  titleCol: string | null;
  authorCol: string | null;
  isbnCol: string | null;
  shelfCol: string | null;
} {
  const lc = headers.map((h) => h.toLowerCase().trim());
  const find = (...candidates: string[]) =>
    headers[lc.findIndex((h) => candidates.some((c) => h.includes(c)))] ?? null;

  return {
    titleCol: find("title", "book", "name"),
    authorCol: find("author", "authors", "by"),
    isbnCol: find("isbn13", "isbn10", "isbn"),
    shelfCol: find("exclusive shelf", "shelf", "status", "bookshelves"),
  };
}

export function CsvImportModal({
  onClose,
  onImportComplete,
}: {
  onClose: () => void;
  onImportComplete: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);

  function parseCsv(file: File) {
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(parsed) {
        if (parsed.errors.length > 0 && parsed.data.length === 0) {
          setError("Could not parse CSV. Make sure it has a header row.");
          return;
        }
        const headers = parsed.meta.fields ?? [];
        const { titleCol, authorCol, isbnCol, shelfCol } = detectColumns(headers);
        if (!titleCol) {
          setError("No title column found. Make sure your CSV has a 'Title' column.");
          return;
        }
        const parsed_rows: ParsedRow[] = parsed.data
          .map((row) => ({
            title: (titleCol ? row[titleCol] : "")?.trim() ?? "",
            author: authorCol ? row[authorCol]?.trim() : undefined,
            isbn: isbnCol ? row[isbnCol]?.trim().replace(/[^0-9X]/gi, "") || undefined : undefined,
            shelf: shelfCol ? row[shelfCol]?.trim() : undefined,
          }))
          .filter((r) => r.title.length > 0);

        if (parsed_rows.length === 0) {
          setError("No valid rows found in CSV.");
          return;
        }
        setRows(parsed_rows.slice(0, 100));
        setStep("preview");
      },
      error(err) {
        setError(err.message);
      },
    });
  }

  function handleFileChange(file: File | null) {
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      setError("Please select a .csv file.");
      return;
    }
    parseCsv(file);
  }

  async function handleImport() {
    setStep("importing");
    setProgress(0);

    // Send in chunks of 20 to show progress
    const chunkSize = 20;
    const chunks: ParsedRow[][] = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
      chunks.push(rows.slice(i, i + chunkSize));
    }

    let totalMatched = 0;
    let totalAdded = 0;
    let totalUnmatched = 0;
    let totalAlreadyExisted = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const res = await fetch("/api/reading-list/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows: chunk }),
      });
      const data = (await res.json()) as ImportResult;
      totalMatched += data.matched ?? 0;
      totalAdded += data.added ?? 0;
      totalUnmatched += data.unmatched ?? 0;
      totalAlreadyExisted += data.alreadyExisted ?? 0;
      setProgress(Math.round(((i + 1) / chunks.length) * 100));
    }

    setResult({
      matched: totalMatched,
      added: totalAdded,
      unmatched: totalUnmatched,
      alreadyExisted: totalAlreadyExisted,
    });
    setStep("done");
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3>Import Books from CSV</h3>
          <button className="rl-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {step === "pick" && (
          <div className="modal-body">
            <p className="muted">
              Supports <strong>Goodreads export</strong> or any CSV with at least a{" "}
              <strong>Title</strong> column. Optional: Author, ISBN, Shelf columns.
            </p>
            {error && <p className="status error">{error}</p>}
            <div
              className={`csv-drop-zone${dragging ? " csv-dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFileChange(e.dataTransfer.files[0] ?? null);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="csv-file-input"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
              <p>Drop your CSV here or click to browse</p>
              <p className="muted">Max 100 books per import</p>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="modal-body">
            <p>
              Found <strong>{rows.length}</strong> book{rows.length !== 1 ? "s" : ""} in CSV. Preview:
            </p>
            <div className="csv-preview-table-wrap">
              <table className="csv-preview-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Author</th>
                    <th>ISBN</th>
                    <th>Shelf</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      <td>{row.title}</td>
                      <td>{row.author ?? "—"}</td>
                      <td>{row.isbn ?? "—"}</td>
                      <td>{row.shelf ?? "to-read"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 5 && <p className="muted">…and {rows.length - 5} more</p>}
            </div>
            <div className="modal-footer">
              <button className="secondary-button" onClick={() => setStep("pick")}>Back</button>
              <button className="primary-button" onClick={() => void handleImport()}>
                Import {rows.length} books
              </button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="modal-body">
            <p>Matching books via Google Books API…</p>
            <div className="csv-progress-bar">
              <div className="csv-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="muted">{progress}% complete</p>
          </div>
        )}

        {step === "done" && result && (
          <div className="modal-body">
            <div className="csv-result">
              <div className="csv-result-row">
                <span className="csv-result-label">Added</span>
                <strong className="csv-result-value success-text">{result.added}</strong>
              </div>
              <div className="csv-result-row">
                <span className="csv-result-label">Already in list</span>
                <strong className="csv-result-value">{result.alreadyExisted}</strong>
              </div>
              <div className="csv-result-row">
                <span className="csv-result-label">Not matched</span>
                <strong className="csv-result-value">{result.unmatched}</strong>
              </div>
            </div>
            <div className="modal-footer">
              <button className="primary-button" onClick={onImportComplete}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
