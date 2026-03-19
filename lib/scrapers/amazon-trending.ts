import * as cheerio from "cheerio";
import { fetchText } from "@/lib/http";

export interface TrendingRawBook {
  rank: number;
  title: string;
  author: string | null;
  isbn: string | null;
}

const CATEGORY_URLS: Record<string, string> = {
  all: "https://www.amazon.in/gp/bestsellers/books",
  fiction: "https://www.amazon.in/gp/bestsellers/books/1318158031",
  nonfiction: "https://www.amazon.in/gp/bestsellers/books/1318157031",
  academic: "https://www.amazon.in/gp/bestsellers/books/1318206031",
  "self-help": "https://www.amazon.in/gp/bestsellers/books/1318164031",
};

function extractIsbnFromUrl(url: string): string | null {
  // Amazon product URLs often contain ISBN-13 in the path or dp segment
  const dpMatch = url.match(/\/dp\/([0-9]{9}[0-9X]|[0-9]{13})/i);
  return dpMatch?.[1] ?? null;
}

function parseHtml(html: string): TrendingRawBook[] {
  const $ = cheerio.load(html);
  const results: TrendingRawBook[] = [];

  // Try the new zg-grid layout first
  $("div.zg-grid-general-faceout, li.zg-item-immutable").each((_, el) => {
    const root = $(el);
    const rankText = root.find(".zg-bdg-text, .a-list-item span").first().text().trim();
    const rank = parseInt(rankText.replace(/[^0-9]/g, ""), 10);
    if (isNaN(rank) || rank <= 0) return;

    const titleEl = root.find("._cDEzb_p13n-sc-css-line-clamp-1_1Fn1y, .p13n-sc-line-clamp-1, a.a-link-normal span").first();
    const title = titleEl.text().trim();
    if (!title) return;

    const href = root.find("a.a-link-normal[href*='/dp/']").first().attr("href") ?? "";
    const isbn = extractIsbnFromUrl(href);
    const author = root.find(".a-size-small.a-link-child, .a-color-secondary a").first().text().trim() || null;

    results.push({ rank, title, author, isbn });
  });

  // Fallback: older layout
  if (results.length === 0) {
    $(".zg_item, .zg-item").each((_, el) => {
      const root = $(el);
      const rankText = root.find(".zg_rankNumber, .zg-rank").text().trim();
      const rank = parseInt(rankText.replace(/[^0-9]/g, ""), 10);
      if (isNaN(rank) || rank <= 0) return;

      const title = root.find(".p13n-sc-truncate, .zg_title a").first().text().trim();
      if (!title) return;

      const href = root.find("a[href*='/dp/']").first().attr("href") ?? "";
      const isbn = extractIsbnFromUrl(href);
      const author = root.find(".a-color-secondary, .zg_byline").first().text().trim().replace(/^by /i, "") || null;

      results.push({ rank, title, author: author || null, isbn });
    });
  }

  return results
    .filter((r) => r.title.length > 0)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 20);
}

export async function scrapeAmazonTrending(category = "all"): Promise<TrendingRawBook[]> {
  const url = CATEGORY_URLS[category] ?? CATEGORY_URLS["all"]!;

  try {
    const html = await fetchText(url, "amazon-trending");
    return parseHtml(html);
  } catch {
    return [];
  }
}
