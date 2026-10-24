import { FIXTURE_MODE } from "../api/client";
import { fetchQuote } from "../api/bookingApi";
import type { PricingTotals } from "../types";
import { useMemo, useEffect, useState } from "react";
import { useBookingStore, getBookingSeats } from "../store/bookingStore";
import { calculatePricing } from "./pricing";
import { getEventDetails } from "../services/catalog";
export function useBooking() {
  const eventId = useBookingStore((s) => s.eventId);
  const selectedSeats = useBookingStore((s) => s.selectedSeats);
  const selectedExtras = useBookingStore((s) => s.selectedExtras);
  const promoCode = useBookingStore((s) => s.promoCode);
  const seats = useMemo(
    () => getBookingSeats({ eventId, selectedSeats }),
    [eventId, selectedSeats],
  );
  const totals = useMemo(
    () => calculatePricing(seats, selectedExtras, promoCode),
    [seats, selectedExtras, promoCode],
  );
  const [serverQuote, setServerQuote] = useState<{
    key: string;
    totals: PricingTotals;
  } | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const key = JSON.stringify([
    eventId,
    selectedSeats,
    selectedExtras,
    promoCode,
  ]);
  useEffect(() => {
    if (FIXTURE_MODE || !selectedSeats.length) return;
    let active = true;
    setQuoteError("");
    fetchQuote()
      .then((data) => {
        if (active) setServerQuote({ key, totals: data.totals });
      })
      .catch((e) => {
        if (active) setQuoteError(e.message);
      });
    return () => {
      active = false;
    };
  }, [key, selectedSeats.length]);
  return {
    eventId,
    details: eventId ? getEventDetails(eventId) : undefined,
    seats,
    selectedExtras,
    promoCode,
    totals:
      !FIXTURE_MODE && serverQuote?.key === key ? serverQuote.totals : totals,
    quoteError,
    authoritative: FIXTURE_MODE || serverQuote?.key === key,
  };
}
