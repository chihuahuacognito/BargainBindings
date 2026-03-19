import { isOfferFresh } from "@/lib/cache-policy";
import { getOffersForBook, upsertBook, upsertOffer } from "@/lib/db";
import { amazonScraper } from "@/lib/scrapers/amazon";
import { bookchorScraper } from "@/lib/scrapers/bookchor";
import { bookswagonScraper } from "@/lib/scrapers/bookswagon";
import { crosswordScraper } from "@/lib/scrapers/crossword";
import { flipkartScraper } from "@/lib/scrapers/flipkart";
import { gyaanstoreScraper } from "@/lib/scrapers/gyaanstore";
import { kitabayScraper } from "@/lib/scrapers/kitabay";
import { odysseyScraper } from "@/lib/scrapers/odyssey";
import { pustakaScraper } from "@/lib/scrapers/pustaka";
import { sapnaonlineScraper } from "@/lib/scrapers/sapnaonline";
import type { CanonicalBook, StoreName, StoreOffer } from "@/lib/types";
import { STORE_NAMES } from "@/lib/stores";

const scrapers = {
  amazon: amazonScraper,
  flipkart: flipkartScraper,
  crossword: crosswordScraper,
  sapnaonline: sapnaonlineScraper,
  bookchor: bookchorScraper,
  bookswagon: bookswagonScraper,
  gyaanstore: gyaanstoreScraper,
  kitabay: kitabayScraper,
  pustaka: pustakaScraper,
  odyssey: odysseyScraper,
};

export async function getOffers({
  book,
  forceRefresh = false,
  store,
}: {
  book: CanonicalBook;
  forceRefresh?: boolean;
  store?: StoreName;
}): Promise<StoreOffer[]> {
  upsertBook(book);

  const cachedOffers = getOffersForBook(book.id);
  const requestedStores = store ? [store] : STORE_NAMES;
  const freshStores = new Set(
    cachedOffers.filter((offer) => isOfferFresh(offer) && !forceRefresh).map((offer) => offer.store),
  );
  const storesToFetch = requestedStores.filter((storeName) => !freshStores.has(storeName));

  if (storesToFetch.length > 0) {
    const fetched = await Promise.all(storesToFetch.map((storeName) => scrapers[storeName].search(book)));
    fetched.forEach(({ offer, logMessage }) => upsertOffer(offer, logMessage));
  }

  const offers = getOffersForBook(book.id);
  return offers.filter((offer) => requestedStores.includes(offer.store));
}
