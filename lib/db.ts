import Database from "better-sqlite3";
import type { CanonicalBook, ScrapeStatus, StoreName, StoreOffer } from "@/lib/types";

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
