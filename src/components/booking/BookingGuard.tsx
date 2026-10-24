import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useBookingStore } from "../../store/bookingStore";
import { events } from "../../data/events";
export function HoldExpiryManager() {
  const expiresAt = useBookingStore((s) => s.seatHoldExpiresAt);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!expiresAt) return;
    const check = () => {
      if (Date.now() < expiresAt) return;
      const store = useBookingStore.getState();
      store.expireHold();
      if (["/extras", "/review", "/checkout"].includes(pathname))
        navigate("/seats", { replace: true });
    };
    check();
    const timer = window.setTimeout(
      check,
      Math.max(0, expiresAt - Date.now()) + 30,
    );
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [expiresAt, pathname, navigate]);
  return null;
}
export function BookingGuard() {
  const count = useBookingStore((s) => s.selectedSeats.length);
  const expiresAt = useBookingStore((s) => s.seatHoldExpiresAt);
  const eventId = useBookingStore((s) => s.eventId);
  if (
    !count ||
    !expiresAt ||
    expiresAt <= Date.now() ||
    !events.some((e) => e.id === eventId)
  )
    return (
      <Navigate
        to="/seats"
        replace
        state={{ message: "Choose your seats before continuing." }}
      />
    );
  return <Outlet />;
}
