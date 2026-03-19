import type { CanonicalBook } from "@/lib/types";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeText(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIsbn(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (digits.length === 10 || digits.length === 13) {
    return digits;
  }

  return null;
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-");
}

export function buildBookId(googleBooksId: string, isbn13: string | null, title: string): string {
  return isbn13 ?? `${googleBooksId}-${slugify(title)}`;
}

export function formatCurrency(value: number | null, currency: string | null): string {
  if (value === null || !currency) {
    return "--";
  }

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatRelativeTime(value: string): string {
  const now = Date.now();
  const then = new Date(value).getTime();
  const minutes = Math.round((then - now) / 60000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(minutes) < 60) {
    return rtf.format(minutes, "minute");
  }

  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return rtf.format(hours, "hour");
  }

  const days = Math.round(hours / 24);
  return rtf.format(days, "day");
}

export function bestQueryForBook(book: CanonicalBook): string {
  return book.isbn13 ?? [book.title, book.authors[0]].filter(Boolean).join(" ");
}

export function detectEditionType(
  title: string,
  subtitle: string | null,
  publisher: string | null,
): import("@/lib/types").EditionType {
  const corpus = [title, subtitle, publisher].filter(Boolean).join(" ");

  if (/audiobook|audio\s*book|brilliance\s*audio|audible|audio\s*cd/i.test(corpus)) return "audiobook";
  if (/kindle|ebook|e-book|e\s*book|digital\s*edition|epub/i.test(corpus)) return "ebook";
  if (/box\s*set|boxed\s*set|omnibus|complete\s*(works|series|collection)|collected\s*edition/i.test(corpus)) return "box-set";
  if (/illustrat/i.test(corpus)) return "illustrated";
  if (/hardcover|hardback|hard\s*cover|cased\s*edition/i.test(corpus)) return "hardcover";
  if (/mass\s*market/i.test(corpus)) return "mass-market";
  if (/trade\s*paper/i.test(corpus)) return "trade-paperback";
  if (/paperback|softcover|soft\s*cover/i.test(corpus)) return "paperback";

  return "unknown";
}

export function scoreCandidate({
  book,
  candidateTitle,
  candidateIsbn,
  candidateAuthor,
}: {
  book: CanonicalBook;
  candidateTitle: string;
  candidateIsbn?: string | null;
  candidateAuthor?: string | null;
}): number {
  const titleNeedle = normalizeText(book.title);
  const titleHaystack = normalizeText(candidateTitle);
  const authorNeedle = normalizeText(book.authors[0] ?? "");
  const authorHaystack = normalizeText(candidateAuthor ?? "");
  const isbnNeedle = normalizeIsbn(book.isbn13) ?? normalizeIsbn(book.isbn10);
  const isbnHaystack = normalizeIsbn(candidateIsbn);

  let score = 0;

  if (isbnNeedle && isbnHaystack && isbnNeedle === isbnHaystack) {
    score += 100;
  }

  if (titleNeedle && titleHaystack.includes(titleNeedle)) {
    score += 40;
  } else if (titleNeedle.split(" ").some((word) => word.length > 3 && titleHaystack.includes(word))) {
    score += 20;
  }

  if (authorNeedle && authorHaystack.includes(authorNeedle)) {
    score += 20;
  }

  return score;
}
