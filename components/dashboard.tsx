"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { STORE_LABELS, STORE_NAMES } from "@/lib/stores";
import type { SearchCandidate, StoreName, StoreOffer } from "@/lib/types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

type SearchState = "idle" | "searching" | "ready" | "error";
type OffersState = "idle" | "loading" | "ready" | "error";

export function Dashboard() {
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [offersState, setOffersState] = useState<OffersState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [offersError, setOffersError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SearchCandidate[]>([]);
  const [selectedBook, setSelectedBook] = useState<SearchCandidate | null>(null);
  const [offers, setOffers] = useState<StoreOffer[]>([]);
  const [isPending, startTransition] = useTransition();

  async function runSearch(term: string) {
    const trimmed = term.trim();
    if (!trimmed) {
      setCandidates([]);
      setSelectedBook(null);
      setOffers([]);
      setSearchState("idle");
      setOffersState("idle");
      setSearchError(null);
      setOffersError(null);
      return;
    }

    setSearchState("searching");
    setSearchError(null);

    try {
      const response = await fetch(`/api/search/books?q=${encodeURIComponent(trimmed)}`);
      const payload = (await response.json()) as { candidates?: SearchCandidate[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Search failed");
      }

      const nextCandidates = payload.candidates ?? [];
      setCandidates(nextCandidates);
      setSelectedBook(nextCandidates[0] ?? null);
      setSearchState("ready");
    } catch (error) {
      setSearchState("error");
      setSearchError(error instanceof Error ? error.message : "Search failed");
    }
  }

  async function loadOffers(book: SearchCandidate, forceRefresh = false, store?: StoreName) {
    setOffersState("loading");
    setOffersError(null);

    try {
      const response = await fetch(
        forceRefresh
          ? "/api/prices/refresh"
          : `/api/prices?googleBookId=${encodeURIComponent(book.googleBooksId)}${store ? `&store=${store}` : ""}`,
        forceRefresh
          ? {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ googleBookId: book.googleBooksId, store }),
            }
          : undefined,
      );
      const payload = (await response.json()) as { offers?: StoreOffer[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Pricing lookup failed");
      }

      const nextOffers = payload.offers ?? [];
      setOffers((current) => {
        if (!store) {
          return nextOffers;
        }

        const merged = current.filter((offer) => offer.store !== store);
        return [...merged, ...nextOffers].sort((left, right) => left.store.localeCompare(right.store));
      });
      setOffersState("ready");
    } catch (error) {
      setOffersState("error");
      setOffersError(error instanceof Error ? error.message : "Pricing lookup failed");
    }
  }

  useEffect(() => {
    if (selectedBook) {
      void loadOffers(selectedBook);
    }
  }, [selectedBook]);

  const allStores: StoreName[] = STORE_NAMES;
  const offerByStore = new Map(offers.map((offer) => [offer.store, offer]));

  return (
    <main className="shell">
      <section className="hero hero-compact">
        <div className="hero-copy compact-copy">
          <p className="eyebrow">Book Pricing Dashboard</p>
          <h1>Compare prices faster.</h1>
          <p className="hero-text">
            Search once, confirm the edition, then compare current bookstore pricing and stock.
          </p>
        </div>
        <div className="hero-note compact-note">
          <strong>Price cache: 6h</strong>
          <span>Out-of-stock cache: 1h</span>
        </div>
      </section>

      <section className="panel search-panel">
        <div className="panel-heading compact-heading">
          <div>
            <h2>Search</h2>
            <p className="muted">Title, author, or ISBN.</p>
          </div>
        </div>
        <div className="search-layout">
          <div>
            <label className="search-label" htmlFor="book-query">
              Search query
            </label>
            <div className="search-row">
              <input
                id="book-query"
                className="search-input"
                placeholder="Atomic Habits, Deep Work, 9781473537804"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    startTransition(() => {
                      void runSearch(query);
                    });
                  }
                }}
              />
              <button
                className="primary-button"
                disabled={isPending || searchState === "searching"}
                onClick={() =>
                  startTransition(() => {
                    void runSearch(query);
                  })
                }
              >
                {searchState === "searching" ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          <div className="selected-mini">
            <span className="mini-label">Selected</span>
            <strong>{selectedBook?.title || "No book selected"}</strong>
            <span>{selectedBook?.isbn13 || selectedBook?.isbn10 || "Choose a result to compare prices"}</span>
          </div>
        </div>

        {searchError ? <p className="status error">{searchError}</p> : null}

        {candidates.length > 0 ? (
          <div className="candidate-list">
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                className={`candidate-card ${selectedBook?.id === candidate.id ? "active" : ""}`}
                onClick={() => setSelectedBook(candidate)}
              >
                <strong>{candidate.title}</strong>
                <span>{candidate.authors.join(", ") || "Unknown author"}</span>
                <span>{candidate.isbn13 || candidate.isbn10 || "No ISBN"}</span>
              </button>
            ))}
          </div>
        ) : searchState === "ready" ? (
          <p className="status">No Google Books candidates matched that query.</p>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Pricing</h2>
            <p className="muted">The main comparison view. Partial results are fine.</p>
          </div>
          <button
            className="secondary-button"
            disabled={!selectedBook || offersState === "loading"}
            onClick={() => selectedBook && void loadOffers(selectedBook, true)}
          >
            Refresh all stores
          </button>
        </div>

        <div className="table-wrap">
          <table className="offers-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Price</th>
                <th>Availability</th>
                <th>Matched Book</th>
                <th>Last Checked</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {allStores.map((store) => {
                const offer = offerByStore.get(store);
                return (
                  <tr key={store}>
                    <td>{STORE_LABELS[store]}</td>
                    <td>{offer ? formatCurrency(offer.priceInr, offer.currency) : "--"}</td>
                    <td>{offer ? offer.availabilityStatus.replaceAll("_", " ") : "not loaded"}</td>
                    <td>
                      <div className="match-cell">
                        <span>{offer?.matchedTitle || "--"}</span>
                        <span>{offer?.matchedIsbn || offer?.rawStatusText || "--"}</span>
                      </div>
                    </td>
                    <td>{offer ? formatRelativeTime(offer.lastCheckedAt) : "--"}</td>
                    <td>
                      <div className="actions">
                        {offer?.productUrl ? (
                          <a className="link-button" href={offer.productUrl} target="_blank" rel="noreferrer">
                            Open
                          </a>
                        ) : null}
                        <button
                          className="secondary-button small"
                          disabled={!selectedBook || offersState === "loading"}
                          onClick={() => selectedBook && void loadOffers(selectedBook, true, store)}
                        >
                          Refresh
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {offersState === "loading" ? <p className="status">Refreshing pricing data...</p> : null}
        {offersError ? <p className="status error">{offersError}</p> : null}
      </section>

      <section className="dashboard-grid compact-grid">
        <article className="panel">
          <div className="panel-heading compact-heading">
            <h2>Selected Book</h2>
          </div>
          {selectedBook ? (
            <div className="book-card compact-book-card">
              {selectedBook.thumbnail ? (
                <Image
                  className="book-cover compact-cover"
                  src={selectedBook.thumbnail}
                  alt={selectedBook.title}
                  width={84}
                  height={120}
                  unoptimized
                />
              ) : (
                <div className="book-cover compact-cover empty">No cover</div>
              )}
              <div className="book-metadata">
                <h3>{selectedBook.title}</h3>
                <p>{selectedBook.authors.join(", ") || "Unknown author"}</p>
                <p>{selectedBook.publisher || "Unknown publisher"}</p>
                <p>{selectedBook.isbn13 || selectedBook.isbn10 || "No ISBN"}</p>
              </div>
            </div>
          ) : (
            <p className="status">Pick a book candidate to load pricing.</p>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading compact-heading">
            <h2>Store Status</h2>
          </div>
          <div className="health-list compact-health-list">
            {allStores.map((store) => {
              const offer = offerByStore.get(store);
              return (
                <div key={store} className="health-item compact-health-item">
                  <div>
                    <strong>{STORE_LABELS[store]}</strong>
                    <p>{offer ? offer.status : "not_loaded"}</p>
                  </div>
                  <span className={`pill ${offer?.status ?? "idle"}`}>
                    {offer ? formatRelativeTime(offer.lastCheckedAt) : "idle"}
                  </span>
                </div>
              );
            })}
          </div>
        </article>
      </section>
    </main>
  );
}
