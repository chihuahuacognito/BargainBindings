import Database from "better-sqlite3";
import type {
  CanonicalBook,
  PriceHistoryPoint,
  ReadingListEntry,
  ReadingShelf,
  ScrapeStatus,
  StoreName,
  StoreOffer,
  TrendingBook,
} from "@/lib/types";

const databasePath = "book-pricing.db";
type SqliteDatabase = ReturnType<typeof createDatabase>;
const globalForDb = globalThis as typeof globalThis & { __bookPricingDb?: SqliteDatabase };

function createDatabase() {
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      google_books_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      authors_json TEXT NOT NULL,
      isbn10 TEXT,
      isbn13 TEXT,
      publisher TEXT,
      thumbnail TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_offers (
      book_id TEXT NOT NULL,
      store TEXT NOT NULL,
      status TEXT NOT NULL,
      product_url TEXT,
      matched_title TEXT,
      matched_isbn TEXT,
      price_inr REAL,
      currency TEXT,
      availability_status TEXT NOT NULL,
      in_stock INTEGER,
      last_checked_at TEXT NOT NULL,
      raw_status_text TEXT,
      scrape_version TEXT NOT NULL,
      notes TEXT,
      source_query TEXT,
      PRIMARY KEY (book_id, store)
    );

    CREATE TABLE IF NOT EXISTS scrape_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      store TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      store TEXT NOT NULL,
      price_inr REAL,
      in_stock INTEGER,
      checked_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ph_book_store
      ON price_history(book_id, store, checked_at);

    CREATE TABLE IF NOT EXISTS reading_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      google_book_id TEXT,
      book_id TEXT,
      shelf TEXT NOT NULL DEFAULT 'to-read',
      date_added TEXT NOT NULL,
      date_started TEXT,
      date_finished TEXT,
      notes TEXT,
      target_price REAL,
      raw_title TEXT,
      raw_author TEXT,
      raw_isbn TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_rl_google_book
      ON reading_list(google_book_id)
      WHERE google_book_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS trending_books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rank INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'all',
      google_book_id TEXT,
      book_id TEXT,
      raw_title TEXT NOT NULL,
      raw_author TEXT,
      raw_isbn TEXT,
      scraped_at TEXT NOT NULL
    );
  `);

  return db;
}

export function getDb() {
  if (!globalForDb.__bookPricingDb) {
    globalForDb.__bookPricingDb = createDatabase();
  }

  return globalForDb.__bookPricingDb;
}

export function upsertBook(book: CanonicalBook): CanonicalBook {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO books (
        id, google_books_id, title, authors_json, isbn10, isbn13, publisher, thumbnail, updated_at
      ) VALUES (
        @id, @googleBooksId, @title, @authorsJson, @isbn10, @isbn13, @publisher, @thumbnail, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        google_books_id = excluded.google_books_id,
        title = excluded.title,
        authors_json = excluded.authors_json,
        isbn10 = excluded.isbn10,
        isbn13 = excluded.isbn13,
        publisher = excluded.publisher,
        thumbnail = excluded.thumbnail,
        updated_at = excluded.updated_at
    `,
  ).run({
    id: book.id,
    googleBooksId: book.googleBooksId,
    title: book.title,
    authorsJson: JSON.stringify(book.authors),
    isbn10: book.isbn10,
    isbn13: book.isbn13,
    publisher: book.publisher,
    thumbnail: book.thumbnail,
    updatedAt: new Date().toISOString(),
  });

  return book;
}

export function getOffersForBook(bookId: string): StoreOffer[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        book_id, store, status, product_url, matched_title, matched_isbn, price_inr,
        currency, availability_status, in_stock, last_checked_at, raw_status_text,
        scrape_version, notes, source_query
      FROM store_offers
      WHERE book_id = ?
    `,
    )
    .all(bookId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    bookId: String(row.book_id),
    store: row.store as StoreName,
    status: row.status as ScrapeStatus,
    productUrl: (row.product_url as string | null) ?? null,
    matchedTitle: (row.matched_title as string | null) ?? null,
    matchedIsbn: (row.matched_isbn as string | null) ?? null,
    priceInr: typeof row.price_inr === "number" ? row.price_inr : null,
    currency: (row.currency as string | null) ?? null,
    availabilityStatus: row.availability_status as StoreOffer["availabilityStatus"],
    inStock: typeof row.in_stock === "number" ? row.in_stock === 1 : null,
    lastCheckedAt: String(row.last_checked_at),
    rawStatusText: (row.raw_status_text as string | null) ?? null,
    scrapeVersion: String(row.scrape_version),
    notes: (row.notes as string | null) ?? null,
    sourceQuery: (row.source_query as string | null) ?? null,
  }));
}

export function upsertOffer(offer: StoreOffer, logMessage: string) {
  const db = getDb();

  // Append to price history before overwriting the latest offer
  if (offer.priceInr !== null || offer.status === "ok") {
    db.prepare(
      `INSERT INTO price_history (book_id, store, price_inr, in_stock, checked_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      offer.bookId,
      offer.store,
      offer.priceInr,
      offer.inStock === null ? null : offer.inStock ? 1 : 0,
      new Date().toISOString(),
    );
  }

  db.prepare(
    `
      INSERT INTO store_offers (
        book_id, store, status, product_url, matched_title, matched_isbn, price_inr, currency,
        availability_status, in_stock, last_checked_at, raw_status_text, scrape_version, notes, source_query
      ) VALUES (
        @bookId, @store, @status, @productUrl, @matchedTitle, @matchedIsbn, @priceInr, @currency,
        @availabilityStatus, @inStock, @lastCheckedAt, @rawStatusText, @scrapeVersion, @notes, @sourceQuery
      )
      ON CONFLICT(book_id, store) DO UPDATE SET
        status = excluded.status,
        product_url = excluded.product_url,
        matched_title = excluded.matched_title,
        matched_isbn = excluded.matched_isbn,
        price_inr = excluded.price_inr,
        currency = excluded.currency,
        availability_status = excluded.availability_status,
        in_stock = excluded.in_stock,
        last_checked_at = excluded.last_checked_at,
        raw_status_text = excluded.raw_status_text,
        scrape_version = excluded.scrape_version,
        notes = excluded.notes,
        source_query = excluded.source_query
    `,
  ).run({
    ...offer,
    inStock: offer.inStock === null ? null : offer.inStock ? 1 : 0,
  });

  db.prepare(
    `
      INSERT INTO scrape_logs (book_id, store, status, message, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
  ).run(offer.bookId, offer.store, offer.status, logMessage, new Date().toISOString());
}

export function getOfferHistory(bookId: string, store?: StoreName, limitDays = 30): PriceHistoryPoint[] {
  const db = getDb();
  const cutoff = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000).toISOString();

  const rows = store
    ? (db
        .prepare(
          `SELECT store, price_inr, in_stock, checked_at FROM price_history
           WHERE book_id = ? AND store = ? AND checked_at >= ?
           ORDER BY checked_at ASC`,
        )
        .all(bookId, store, cutoff) as Array<Record<string, unknown>>)
    : (db
        .prepare(
          `SELECT store, price_inr, in_stock, checked_at FROM price_history
           WHERE book_id = ? AND checked_at >= ?
           ORDER BY checked_at ASC`,
        )
        .all(bookId, cutoff) as Array<Record<string, unknown>>);

  return rows.map((row) => ({
    store: row.store as StoreName,
    priceInr: typeof row.price_inr === "number" ? row.price_inr : null,
    inStock: typeof row.in_stock === "number" ? row.in_stock === 1 : null,
    checkedAt: String(row.checked_at),
  }));
}

// ── Reading List ───────────────────────────────────────────────────────────

function getBestPricesForBooks(bookIds: string[]): Map<string, { priceInr: number; store: StoreName }> {
  if (bookIds.length === 0) return new Map();
  const db = getDb();
  const placeholders = bookIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT book_id, store, price_inr FROM store_offers
       WHERE price_inr IS NOT NULL AND book_id IN (${placeholders})
       ORDER BY price_inr ASC`,
    )
    .all(...bookIds) as Array<{ book_id: string; store: string; price_inr: number }>;

  const result = new Map<string, { priceInr: number; store: StoreName }>();
  for (const row of rows) {
    if (!result.has(row.book_id)) {
      result.set(row.book_id, { priceInr: row.price_inr, store: row.store as StoreName });
    }
  }
  return result;
}

export function getReadingList(shelf?: ReadingShelf): ReadingListEntry[] {
  const db = getDb();

  const query = shelf
    ? `SELECT rl.*, b.title, b.authors_json, b.isbn10, b.isbn13, b.thumbnail, b.publisher
       FROM reading_list rl
       LEFT JOIN books b ON b.id = rl.book_id
       WHERE rl.shelf = ?
       ORDER BY rl.date_added DESC`
    : `SELECT rl.*, b.title, b.authors_json, b.isbn10, b.isbn13, b.thumbnail, b.publisher
       FROM reading_list rl
       LEFT JOIN books b ON b.id = rl.book_id
       ORDER BY rl.date_added DESC`;

  const rows = (shelf ? db.prepare(query).all(shelf) : db.prepare(query).all()) as Array<Record<string, unknown>>;

  const bookIds = rows.map((r) => r.book_id as string).filter(Boolean);
  const bestPrices = getBestPricesForBooks(bookIds);

  return rows.map((row) => {
    const bookId = (row.book_id as string | null) ?? null;
    const best = bookId ? bestPrices.get(bookId) : undefined;
    let authors: string[] = [];
    try {
      if (row.authors_json) authors = JSON.parse(row.authors_json as string) as string[];
    } catch {
      authors = [];
    }
    return {
      id: row.id as number,
      shelf: (row.shelf as ReadingShelf) ?? "to-read",
      dateAdded: String(row.date_added),
      dateStarted: (row.date_started as string | null) ?? null,
      dateFinished: (row.date_finished as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      targetPrice: typeof row.target_price === "number" ? row.target_price : null,
      rawTitle: (row.raw_title as string | null) ?? null,
      rawAuthor: (row.raw_author as string | null) ?? null,
      rawIsbn: (row.raw_isbn as string | null) ?? null,
      googleBookId: (row.google_book_id as string | null) ?? null,
      bookId,
      title: (row.title as string | null) ?? null,
      authors,
      isbn13: (row.isbn13 as string | null) ?? null,
      isbn10: (row.isbn10 as string | null) ?? null,
      thumbnail: (row.thumbnail as string | null) ?? null,
      publisher: (row.publisher as string | null) ?? null,
      bestPriceInr: best?.priceInr ?? null,
      bestPriceStore: best?.store ?? null,
    };
  });
}

export function addToReadingList(entry: {
  googleBookId?: string | null;
  bookId?: string | null;
  shelf?: ReadingShelf;
  rawTitle?: string | null;
  rawAuthor?: string | null;
  rawIsbn?: string | null;
}): number | null {
  const db = getDb();
  const now = new Date().toISOString();
  try {
    const result = db
      .prepare(
        `INSERT INTO reading_list (google_book_id, book_id, shelf, date_added, raw_title, raw_author, raw_isbn)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.googleBookId ?? null,
        entry.bookId ?? null,
        entry.shelf ?? "to-read",
        now,
        entry.rawTitle ?? null,
        entry.rawAuthor ?? null,
        entry.rawIsbn ?? null,
      );
    return result.lastInsertRowid as number;
  } catch {
    // Duplicate google_book_id — already in list
    return null;
  }
}

export function updateReadingListEntry(
  id: number,
  updates: {
    shelf?: ReadingShelf;
    notes?: string | null;
    targetPrice?: number | null;
    dateStarted?: string | null;
    dateFinished?: string | null;
  },
) {
  const db = getDb();
  db.prepare(
    `UPDATE reading_list SET
       shelf = COALESCE(@shelf, shelf),
       notes = @notes,
       target_price = @targetPrice,
       date_started = @dateStarted,
       date_finished = @dateFinished
     WHERE id = @id`,
  ).run({
    id,
    shelf: updates.shelf ?? null,
    notes: updates.notes ?? null,
    targetPrice: updates.targetPrice ?? null,
    dateStarted: updates.dateStarted ?? null,
    dateFinished: updates.dateFinished ?? null,
  });
}

export function removeFromReadingList(id: number) {
  const db = getDb();
  db.prepare(`DELETE FROM reading_list WHERE id = ?`).run(id);
}

// ── Trending Books ─────────────────────────────────────────────────────────

export function getTrendingBooks(category?: string, limit = 20): TrendingBook[] {
  const db = getDb();

  const query = category && category !== "all"
    ? `SELECT tb.*, b.title, b.authors_json, b.isbn13, b.thumbnail
       FROM trending_books tb
       LEFT JOIN books b ON b.id = tb.book_id
       WHERE tb.category = ?
       ORDER BY tb.rank ASC
       LIMIT ?`
    : `SELECT tb.*, b.title, b.authors_json, b.isbn13, b.thumbnail
       FROM trending_books tb
       LEFT JOIN books b ON b.id = tb.book_id
       WHERE tb.category = 'all'
       ORDER BY tb.rank ASC
       LIMIT ?`;

  const rows = (
    category && category !== "all"
      ? db.prepare(query).all(category, limit)
      : db.prepare(query).all(limit)
  ) as Array<Record<string, unknown>>;

  const bookIds = rows.map((r) => r.book_id as string).filter(Boolean);
  const bestPrices = getBestPricesForBooks(bookIds);

  return rows.map((row) => {
    const bookId = (row.book_id as string | null) ?? null;
    const best = bookId ? bestPrices.get(bookId) : undefined;
    let authors: string[] = [];
    try {
      if (row.authors_json) authors = JSON.parse(row.authors_json as string) as string[];
    } catch {
      authors = [];
    }
    return {
      rank: row.rank as number,
      category: String(row.category),
      rawTitle: String(row.raw_title),
      rawAuthor: (row.raw_author as string | null) ?? null,
      googleBookId: (row.google_book_id as string | null) ?? null,
      bookId,
      scrapedAt: String(row.scraped_at),
      title: (row.title as string | null) ?? null,
      authors,
      thumbnail: (row.thumbnail as string | null) ?? null,
      isbn13: (row.isbn13 as string | null) ?? null,
      bestPriceInr: best?.priceInr ?? null,
      bestPriceStore: best?.store ?? null,
    };
  });
}

export function upsertTrendingBooks(
  books: Array<{
    rank: number;
    category: string;
    googleBookId?: string | null;
    bookId?: string | null;
    rawTitle: string;
    rawAuthor?: string | null;
    rawIsbn?: string | null;
  }>,
) {
  if (books.length === 0) return;
  const db = getDb();
  const category = books[0]!.category;
  const now = new Date().toISOString();

  const deleteAndInsert = db.transaction(() => {
    db.prepare(`DELETE FROM trending_books WHERE category = ?`).run(category);
    const insert = db.prepare(
      `INSERT INTO trending_books (rank, category, google_book_id, book_id, raw_title, raw_author, raw_isbn, scraped_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const book of books) {
      insert.run(
        book.rank,
        book.category,
        book.googleBookId ?? null,
        book.bookId ?? null,
        book.rawTitle,
        book.rawAuthor ?? null,
        book.rawIsbn ?? null,
        now,
      );
    }
  });

  deleteAndInsert();
}

export function getLatestTrendingScrapeTime(category = "all"): string | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT scraped_at FROM trending_books WHERE category = ? ORDER BY scraped_at DESC LIMIT 1`)
    .get(category) as { scraped_at: string } | undefined;
  return row?.scraped_at ?? null;
}
