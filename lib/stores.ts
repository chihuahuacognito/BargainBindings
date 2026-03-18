import type { StoreName } from "@/lib/types";

export const STORE_NAMES: StoreName[] = [
  "amazon",
  "flipkart",
  "crossword",
  "sapnaonline",
  "bookchor",
  "bookswagon",
  "gyaanstore",
  "kitabay",
];

export const STORE_LABELS: Record<StoreName, string> = {
  amazon: "Amazon.in",
  flipkart: "Flipkart",
  crossword: "Crossword",
  sapnaonline: "SapnaOnline",
  bookchor: "BookChor",
  bookswagon: "Bookswagon",
  gyaanstore: "Gyaanstore",
  kitabay: "Kitabay",
};

export function isStoreName(value: string | null | undefined): value is StoreName {
  return !!value && STORE_NAMES.includes(value as StoreName);
}
