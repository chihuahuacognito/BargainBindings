"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Feather, GraduationCap, Newspaper, RefreshCw, Zap } from "lucide-react";
import type { TrendingBook } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type Category = "all" | "fiction" | "nonfiction" | "self-help" | "academic";

const CATEGORY_LABELS: Record<Category, string> = {
  all: "Trending Now",
  fiction: "Fiction",
  nonfiction: "Non-Fiction",
  "self-help": "Self-Help",
  academic: "Academic",
};

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  all: <BookOpen size={12} strokeWidth={1.8} />,
  fiction: <Feather size={12} strokeWidth={1.8} />,
  nonfiction: <Newspaper size={12} strokeWidth={1.8} />,
  "self-help": <Zap size={12} strokeWidth={1.8} />,
  academic: <GraduationCap size={12} strokeWidth={1.8} />,
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

// Rate-limit refresh to once per hour per session
const LAST_REFRESH_KEY = "trending_last_refresh";
function canRefresh(): boolean {
  if (typeof window === "undefined") return false;
  const last = localStorage.getItem(LAST_REFRESH_KEY);
  if (!last) return true;
  return Date.now() - Number(last) > 60 * 60 * 1000;
}
function markRefreshed() {
  if (typeof window !== "undefined") localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()));
}

export function TrendingSection({ onSearch }: { onSearch: (query: string) => void }) {
  const [category, setCategory] = useState<Category>("all");
  const [books, setBooks] = useState<TrendingBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedCategories = useRef(new Set<string>());
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(dir: 1 | -1) {
    scrollRef.current?.scrollBy({ left: dir * 600, behavior: "smooth" });
  }

  const fetchTrending = useCallback(async (cat: Category, forceRefresh = false) => {
    if (!forceRefresh && fetchedCategories.current.has(cat)) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ category: cat });
      if (forceRefresh) params.set("refresh", "true");
      const res = await fetch(`/api/trending?${params.toString()}`);
      const data = (await res.json()) as { books?: TrendingBook[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load trending");
      setBooks(data.books ?? []);
      fetchedCategories.current.add(cat);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trending books");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTrending(category);
  }, [category, fetchTrending]);

  async function handleRefresh() {
    if (!canRefresh()) return;
    setRefreshing(true);
    markRefreshed();
    fetchedCategories.current.delete(category);
    await fetchTrending(category, true);
    setRefreshing(false);
  }

  return (
    <section className="panel trending-section">
      <div className="panel-heading">
        <div>
          <h2>Trending Globally</h2>
          <p className="muted">Most-read books worldwide via Open Library — updated weekly.</p>
        </div>
        <div className="trending-controls">
          <button className="trending-scroll-btn" onClick={() => scroll(-1)} aria-label="Scroll left"><ChevronLeft size={15} strokeWidth={2} /></button>
          <button className="trending-scroll-btn" onClick={() => scroll(1)} aria-label="Scroll right"><ChevronRight size={15} strokeWidth={2} /></button>
          <button
            className="secondary-button small"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
          >
            <span className="icon-btn-inner">
              {refreshing ? <span className="spinner spinner-sm" /> : <RefreshCw size={12} strokeWidth={2} />}
              {refreshing ? "Refreshing…" : "Refresh"}
            </span>
          </button>
        </div>
      </div>

      <div className="trending-tabs">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`trending-tab${category === cat ? " trending-tab-active" : ""}`}
            onClick={() => setCategory(cat)}
          >
            <span className="trending-tab-inner">
              {CATEGORY_ICONS[cat]}
              {CATEGORY_LABELS[cat]}
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <p className="status error">{error}</p>
      ) : loading ? (
        <div className="trending-scroll-wrap">
          <div className="trending-grid">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="skeleton-trending-card">
                <div className="skel skel-rank" />
                <div className="skel skel-cover" />
                <div className="skel skel-line" />
                <div className="skel skel-line-s" />
                <div className="skel skel-line-xs" />
              </div>
            ))}
          </div>
        </div>
      ) : books.length === 0 ? (
        <p className="status">No trending books found. Try refreshing.</p>
      ) : (
        <div className="trending-scroll-wrap">
        <div className="trending-grid" ref={scrollRef}>
          {books.map((book, index) => (
            <button
              key={`${book.rank}-${index}`}
              className="trending-card"
              onClick={() => {
                const query = book.isbn13 ?? (book.title ?? book.rawTitle);
                onSearch(query);
              }}
            >
              <span className="trending-rank">#{book.rank}</span>
              {book.thumbnail ? (
                <Image
                  src={book.thumbnail}
                  alt={book.title ?? book.rawTitle}
                  width={64}
                  height={90}
                  className="trending-cover"
                  unoptimized
                />
              ) : (
                <div className="trending-cover trending-cover-empty" />
              )}
              <div className="trending-meta">
                <strong className="trending-book-title">{book.title ?? book.rawTitle}</strong>
                <span className="muted trending-author">
                  {book.authors.length > 0 ? book.authors[0] : book.rawAuthor ?? ""}
                </span>
                {book.bestPriceInr !== null ? (
                  <span className="trending-price">{formatCurrency(book.bestPriceInr, "INR")}</span>
                ) : (
                  <span className="trending-price muted">Check price</span>
                )}
              </div>
            </button>
          ))}
        </div>
        </div>
      )}
    </section>
  );
}
