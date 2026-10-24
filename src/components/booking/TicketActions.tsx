import { useState } from "react";
import {
  Printer,
  CalendarPlus,
  MapPin,
  Link as LinkIcon,
  Share2,
} from "lucide-react";
import type { Order } from "../../types";
import { downloadCalendar, directionsUrl } from "../../utils/ticketActions";
export function TicketActions({ order }: { order: Order }) {
  const [status, setStatus] = useState("");
  const url = `${window.location.origin}/events/${order.eventId}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Event link copied.");
    } catch {
      setStatus(`Copy this event link: ${url}`);
    }
  }
  async function share() {
    try {
      await navigator.share({
        title: `${order.artist} · ${order.eventName}`,
        text: "Find your next unforgettable night on VIBETIX.",
        url,
      });
      setStatus("Event shared.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setStatus("Sharing is unavailable. Use Copy Link instead.");
    }
  }
  return (
    <div className="ticket-actions">
      <div>
        <button
          className="button button-secondary"
          disabled={!order.tickets.length}
          onClick={() => window.print()}
        >
          <Printer size={16} />
          Print Tickets
        </button>
        <button
          className="button button-secondary"
          onClick={() => downloadCalendar(order)}
        >
          <CalendarPlus size={16} />
          Add to Calendar
        </button>
        <a
          className="button button-secondary"
          href={directionsUrl(order)}
          target="_blank"
          rel="noreferrer"
        >
          <MapPin size={16} />
          Get Directions
        </a>
        <button className="button button-secondary" onClick={copy}>
          <LinkIcon size={16} />
          Copy Link
        </button>
        {typeof navigator.share === "function" && (
          <button className="button button-secondary" onClick={share}>
            <Share2 size={16} />
            Share Event
          </button>
        )}
      </div>
      {status && (
        <p className="action-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
