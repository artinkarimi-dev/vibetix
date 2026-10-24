import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { useBookingStore } from "../../store/bookingStore";
export function HoldTimer() {
  const expiresAt = useBookingStore((s) => s.seatHoldExpiresAt);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!expiresAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return (
    <span
      className={`hold-timer ${remaining < 60 ? "urgent" : ""}`}
      aria-label={`Simulated seat hold ${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}
    >
      <Clock3 size={14} />
      <span>
        Seats held for{" "}
        <strong>
          {String(Math.floor(remaining / 60)).padStart(2, "0")}:
          {String(remaining % 60).padStart(2, "0")}
        </strong>
      </span>
    </span>
  );
}
