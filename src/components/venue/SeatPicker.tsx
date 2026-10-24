import { profileRender } from "../../utils/profile";
import { memo, useState } from "react";
import { useBookingStore } from "../../store/bookingStore";
import { getSectionInventory } from "../../data/inventory";
import { formatMoney } from "../../utils/pricing";
import type { Seat, VenueSection } from "../../types";
const SeatButton = memo(function SeatButton({
  seat,
  onError,
}: {
  seat: Seat;
  onError: (message: string) => void;
}) {
  const selected = useBookingStore((s) => s.selectedSeats.includes(seat.id));
  const toggle = useBookingStore((s) => s.toggleSeat);
  return (
    <button
      className={`seat-button ${selected ? "selected" : ""}`}
      disabled={seat.status === "unavailable"}
      aria-label={`Section ${seat.section} row ${seat.row} seat ${seat.number}${seat.status === "unavailable" ? ", unavailable" : ""}`}
      aria-pressed={selected}
      data-seat-id={seat.id}
      data-render-count={profileRender("seat:" + seat.id)}
      onClick={() => {
        const message = toggle(seat.id);
        if (message) onError(message);
      }}
    >
      {seat.number}
    </button>
  );
});
export function SeatPicker({
  eventId,
  section,
}: {
  eventId: string;
  section: VenueSection;
}) {
  const [error, setError] = useState("");
  const [rowFilter, setRowFilter] = useState("all");
  const inventory = getSectionInventory(eventId, section);
  return (
    <section
      data-render-count={profileRender("picker")}
      className="seat-picker panel"
      aria-labelledby="seat-picker-title"
    >
      <div className="picker-heading">
        <div>
          <span className="eyebrow">YOUR VIEW OF THE NIGHT</span>
          <h2 id="seat-picker-title">{section.name}</h2>
          <p>
            {section.tierId.replace("-", " ")} ·{" "}
            {formatMoney(inventory.seats[0]?.priceCents ?? 0)} per seat
          </p>
        </div>
        <label>
          Row
          <select
            value={rowFilter}
            onChange={(e) => setRowFilter(e.target.value)}
            aria-label="Filter seat rows"
          >
            <option value="all">All rows</option>
            {inventory.rows.map((row) => (
              <option key={row.id} value={row.number}>
                Row {row.number}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="picker-instruction">
        Tap a numbered seat to select it. You can choose up to 6.
      </p>
      {error && (
        <p className="inline-alert" role="alert">
          {error}
          <button
            onClick={() => setError("")}
            aria-label="Dismiss seat message"
          >
            ×
          </button>
        </p>
      )}
      <div className="seat-rows">
        {inventory.rows
          .filter(
            (row) => rowFilter === "all" || String(row.number) === rowFilter,
          )
          .map((row) => (
            <div className="seat-row" key={row.id}>
              <span>Row {row.number}</span>
              <div>
                {inventory.seats
                  .filter((seat) => seat.row === row.number)
                  .map((seat) => (
                    <SeatButton key={seat.id} seat={seat} onError={setError} />
                  ))}
              </div>
            </div>
          ))}
      </div>
      <div className="seat-status-legend">
        <span>
          <i />
          Available
        </span>
        <span>
          <i className="selected" />
          Selected
        </span>
        <span>
          <i className="unavailable" />
          Unavailable
        </span>
      </div>
    </section>
  );
}
