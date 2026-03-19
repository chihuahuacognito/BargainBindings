"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, useTransition } from "react";
import { ArrowLeft, BookOpen, ChevronDown, ChevronUp, RefreshCw, Search } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { STORE_LABELS, STORE_NAMES } from "@/lib/stores";
import type { EditionType, PriceHistoryPoint, SearchCandidate, StoreName, StoreOffer } from "@/lib/types";
import { EDITION_LABELS } from "@/lib/types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import { ReadingList } from "@/components/reading-list";
import { TrendingSection } from "@/components/trending-section";

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

  // Price history (Feature 5)
  const [priceHistory, setPriceHistory] = useState<PriceHistoryPoint[]>([]);
  const [expandedStore, setExpandedStore] = useState<StoreName | null>(null);

  // Reading list panel (Feature 7)
  const [showReadingList, setShowReadingList] = useState(false);
  const [addedToList, setAddedToList] = useState<Set<string>>(new Set());
  const [addingToList, setAddingToList] = useState<Set<string>>(new Set());

  // Per-store refresh tracking
  const [refreshingStore, setRefreshingStore] = useState<StoreName | null>(null);

  // Edition filter for candidate list
  const [editionFilter, setEditionFilter] = useState<EditionType | "all">("all");

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
      setEditionFilter("all");
      setSearchState("ready");
    } catch (error) {
      setSearchState("error");
      setSearchError(error instanceof Error ? error.message : "Search failed");
    }
  }

  async function loadOffers(book: SearchCandidate, forceRefresh = false, store?: StoreName) {
    if (forceRefresh && store) setRefreshingStore(store);
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
    } finally {
      setRefreshingStore(null);
    }
  }

  const loadPriceHistory = useCallback(async (book: SearchCandidate) => {
    try {
      const res = await fetch(`/api/prices/history?googleBookId=${encodeURIComponent(book.googleBooksId)}`);
      const data = (await res.json()) as { history?: PriceHistoryPoint[] };
      setPriceHistory(data.history ?? []);
    } catch {
      setPriceHistory([]);
    }
  }, []);

  async function addToReadingList(book: SearchCandidate) {
    setAddingToList((prev) => new Set(prev).add(book.googleBooksId));
    try {
      const res = await fetch("/api/reading-list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ googleBookId: book.googleBooksId, bookId: book.id }),
      });
      const data = (await res.json()) as { added?: boolean; alreadyExists?: boolean };
      if (data.added || data.alreadyExists) {
        setAddedToList((prev) => new Set(prev).add(book.googleBooksId));
      }
    } finally {
      setAddingToList((prev) => { const s = new Set(prev); s.delete(book.googleBooksId); return s; });
    }
  }

  useEffect(() => {
    if (selectedBook) {
      void loadOffers(selectedBook);
      void loadPriceHistory(selectedBook);
      setExpandedStore(null);
    }
  }, [selectedBook, loadPriceHistory]);

  const allStores: StoreName[] = STORE_NAMES;
  const offerByStore = new Map(offers.map((offer) => [offer.store, offer]));

  function storeHistory(store: StoreName) {
    return priceHistory
      .filter((p) => p.store === store && p.priceInr !== null)
      .map((p) => ({
        date: new Date(p.checkedAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
        price: p.priceInr!,
      }));
  }

  function lowestEver(store: StoreName): number | null {
    const pts = priceHistory.filter((p) => p.store === store && p.priceInr !== null);
    if (pts.length === 0) return null;
    return Math.min(...pts.map((p) => p.priceInr!));
  }

  function handleReadingListSearch(q: string) {
    setQuery(q);
    startTransition(() => {
      void runSearch(q);
    });
  }

  function resetToHome() {
    setQuery("");
    setCandidates([]);
    setSelectedBook(null);
    setOffers([]);
    setPriceHistory([]);
    setSearchState("idle");
    setOffersState("idle");
    setSearchError(null);
    setOffersError(null);
    setEditionFilter("all");
    setExpandedStore(null);
  }

  return (
    <>
      <ReadingList
        open={showReadingList}
        onClose={() => setShowReadingList(false)}
        onSearch={handleReadingListSearch}
      />

      <main className="shell">
        <section className="hero hero-compact">
          <div className="hero-copy compact-copy">
            <p className="eyebrow">
              Book Pricing Dashboard
              {searchState !== "idle" && selectedBook ? (
                <>
                  <span className="eyebrow-sep">›</span>
                  <span className="eyebrow-crumb">{selectedBook.title}</span>
                </>
              ) : null}
            </p>
            <h1>Compare prices faster.</h1>
            <p className="hero-text">
              Search once, confirm the edition, then compare current bookstore pricing and stock.
            </p>
          </div>
          <div className="hero-right">
            <div className="hero-note compact-note">
              <strong>Price cache: 6h</strong>
              <span>Out-of-stock cache: 1h</span>
            </div>
            <button
              className="secondary-button my-books-btn"
              onClick={() => setShowReadingList(true)}
            >
              <span className="icon-btn-inner"><BookOpen size={14} strokeWidth={1.5} />My Books</span>
            </button>
          </div>
        </section>

        <section className="panel search-panel">
          <div className="panel-heading compact-heading">
            <div>
              {searchState !== "idle" ? (
                <button className="back-home-btn" onClick={resetToHome}>
                  <span className="icon-btn-inner"><ArrowLeft size={13} strokeWidth={2} />Home</span>
                </button>
              ) : null}
              <h2>Search</h2>
              <p className="muted">Title, author, or ISBN.</p>
            </div>
          </div>

          <div className="search-split">
            {/* LEFT — input + results */}
            <div className="search-left">
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
                  <span className="btn-inner">
                    {searchState === "searching" ? <span className="spinner spinner-sm" /> : <Search size={14} strokeWidth={2} />}
                    {searchState === "searching" ? "Searching…" : "Search"}
                  </span>
                </button>
              </div>

              {searchError ? <p className="status error">{searchError}</p> : null}

              {candidates.length > 0 ? (() => {
                const knownEditions = [...new Set(
                  candidates.map((c) => c.editionType).filter((e) => e !== "unknown")
                )] as EditionType[];
                const showFilter = knownEditions.length >= 2;
                const displayed = editionFilter === "all"
                  ? candidates
                  : candidates.filter((c) => c.editionType === editionFilter);

                return (
                  <>
                    {showFilter && (
                      <div className="edition-filter">
                        <button
                          className={`edition-filter-btn${editionFilter === "all" ? " active" : ""}`}
                          onClick={() => setEditionFilter("all")}
                        >
                          All <span className="edition-filter-count">{candidates.length}</span>
                        </button>
                        {knownEditions.map((et) => (
                          <button
                            key={et}
                            className={`edition-filter-btn${editionFilter === et ? " active" : ""}`}
                            onClick={() => setEditionFilter(et)}
                          >
                            {EDITION_LABELS[et]}
                            <span className="edition-filter-count">
                              {candidates.filter((c) => c.editionType === et).length}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="candidate-list">
                      {displayed.map((candidate, index) => (
                        <div
                          key={candidate.id}
                          className={`candidate-card ${selectedBook?.id === candidate.id ? "active" : ""}`}
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <button
                            className="candidate-select"
                            onClick={() => setSelectedBook(candidate)}
                          >
                            <div className="candidate-title-row">
                              <strong>{candidate.title}</strong>
                              {candidate.editionType !== "unknown" && (
                                <span className={`edition-badge edition-${candidate.editionType}`}>
                                  {EDITION_LABELS[candidate.editionType]}
                                </span>
                              )}
                            </div>
                            <span>{candidate.authors.join(", ") || "Unknown author"}</span>
                            <span>
                              {[candidate.publisher, candidate.publishedDate].filter(Boolean).join(" · ") || candidate.isbn13 || candidate.isbn10 || "No ISBN"}
                            </span>
                          </button>
                          <button
                            className={`secondary-button small add-list-btn${addedToList.has(candidate.googleBooksId) ? " add-list-btn-done" : ""}`}
                            onClick={() => void addToReadingList(candidate)}
                            disabled={addingToList.has(candidate.googleBooksId) || addedToList.has(candidate.googleBooksId)}
                            title="Add to My Books"
                          >
                            <span className="btn-inner">
                              {addingToList.has(candidate.googleBooksId) && <span className="spinner spinner-sm" />}
                              {addedToList.has(candidate.googleBooksId) ? "✓ Listed" : addingToList.has(candidate.googleBooksId) ? "Adding…" : "+ List"}
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })() : searchState === "ready" ? (
                <p className="status">No Google Books candidates matched that query.</p>
              ) : null}
            </div>

            {/* RIGHT — selected book detail */}
            <div className="search-right">
              <span className="mini-label">Selected edition</span>
              {selectedBook ? (
                <div className="selected-detail">
                  {selectedBook.thumbnail ? (
                    <Image
                      src={selectedBook.thumbnail}
                      alt={selectedBook.title}
                      width={54}
                      height={78}
                      className="selected-detail-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="selected-detail-cover selected-detail-cover-empty" />
                  )}
                  <div className="selected-detail-meta">
                    <strong>{selectedBook.title}</strong>
                    {selectedBook.subtitle && <span className="selected-detail-subtitle">{selectedBook.subtitle}</span>}
                    <span>{selectedBook.authors.join(", ") || "Unknown author"}</span>
                    <span>{selectedBook.isbn13 ?? selectedBook.isbn10 ?? "No ISBN"}</span>
                    {selectedBook.publisher && <span>{selectedBook.publisher}</span>}
                    {selectedBook.publishedDate && <span>{selectedBook.publishedDate}</span>}
                  </div>
                </div>
              ) : (
                <p className="selected-empty-hint">Pick a result on the left to load pricing.</p>
              )}
            </div>
          </div>
        </section>

        {searchState === "idle" && (
          <TrendingSection
            onSearch={(q) => {
              setQuery(q);
              startTransition(() => {
                void runSearch(q);
              });
            }}
          />
        )}

        <section className="panel">
          {offersState === "loading" && <div className="panel-loading-bar" />}
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
              <span className="btn-inner">
                {offersState === "loading" && !refreshingStore ? <span className="spinner spinner-sm" /> : <RefreshCw size={13} strokeWidth={2} />}
                {offersState === "loading" && !refreshingStore ? "Refreshing…" : "Refresh all stores"}
              </span>
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
                  const history = storeHistory(store);
                  const lowest = lowestEver(store);
                  const isExpanded = expandedStore === store;

                  return (
                    <>
                      <tr key={store}>
                        <td>
                          <div className="store-name-cell">
                            <span>{STORE_LABELS[store]}</span>
                            {offer && offer.status !== "ok" && (
                              <span className={`scrape-status-badge scrape-${offer.status}`}>
                                {offer.status.replace("_", " ")}
                              </span>
                            )}
                            {history.length > 1 && (
                              <button
                                className="history-toggle"
                                onClick={() => setExpandedStore(isExpanded ? null : store)}
                              >
                                {isExpanded ? <ChevronUp size={11} strokeWidth={2.5} /> : <ChevronDown size={11} strokeWidth={2.5} />}
                              </button>
                            )}
                          </div>
                        </td>
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
                              disabled={!selectedBook || offersState === "loading" || refreshingStore === store}
                              onClick={() => selectedBook && void loadOffers(selectedBook, true, store)}
                            >
                              <span className="btn-inner">
                                {refreshingStore === store && <span className="spinner spinner-sm" />}
                                {refreshingStore === store ? "Refreshing…" : "Refresh"}
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && history.length > 1 && (
                        <tr key={`${store}-history`} className="history-row">
                          <td colSpan={6}>
                            <div className="history-panel">
                              <div className="history-meta">
                                <span className="muted">30-day price trend</span>
                                {lowest !== null && (
                                  <span className="lowest-ever">
                                    Lowest ever: {formatCurrency(lowest, "INR")}
                                  </span>
                                )}
                              </div>
                              <ResponsiveContainer width="100%" height={120}>
                                <LineChart data={history} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6a6075" }} axisLine={false} tickLine={false} />
                                  <Tooltip
                                    formatter={(value) => [
                                      formatCurrency(typeof value === "number" ? value : null, "INR"),
                                      "Price",
                                    ]}
                                    contentStyle={{
                                      background: "#131120",
                                      border: "1px solid rgba(223,96,48,0.3)",
                                      borderRadius: 2,
                                      fontSize: "0.84rem",
                                      color: "#e8e4d8",
                                    }}
                                    labelStyle={{ color: "#6a6075", fontSize: "0.76rem" }}
                                    itemStyle={{ color: "#f07848" }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="price"
                                    stroke="#df6030"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 4, fill: "#f07848", strokeWidth: 0 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {offersState === "loading" ? (
            <p className="status">
              <span className="btn-inner"><span className="spinner spinner-sm" /> Fetching prices from all stores…</span>
            </p>
          ) : null}
          {offersError ? <p className="status error">{offersError}</p> : null}
        </section>

      </main>
    </>
  );
}
