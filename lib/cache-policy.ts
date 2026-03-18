import type { StoreOffer } from "@/lib/types";

const HOUR_IN_MS = 60 * 60 * 1000;

export function getOfferTtlMs(offer: StoreOffer): number {
  if (offer.inStock === false || offer.availabilityStatus === "out_of_stock") {
    return HOUR_IN_MS;
  }

  return 6 * HOUR_IN_MS;
}

export function isOfferFresh(offer: StoreOffer): boolean {
  return Date.now() - new Date(offer.lastCheckedAt).getTime() < getOfferTtlMs(offer);
}
