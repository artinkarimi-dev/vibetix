import { useMemo } from "react";
import QRCode from "qrcode";
import type { DigitalTicket } from "../../types";
import { formatEventDate, formatEventTime } from "../../utils/format";
export function DigitalTicketCard({ ticket }: { ticket: DigitalTicket }) {
  const qr = useMemo(() => {
    const result = QRCode.create(ticket.qrValue, { errorCorrectionLevel: "M" });
    let path = "";
    for (let y = 0; y < result.modules.size; y++) {
      for (let x = 0; x < result.modules.size; x++) {
        if (result.modules.get(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
      }
    }
    return { path, size: result.modules.size + 8 };
  }, [ticket.qrValue]);
  return (
    <article className="digital-ticket" data-testid="digital-ticket">
      <div className="ticket-event-info">
        <span className="eyebrow">VIBETIX · DIGITAL DEMO TICKET</span>
        <h2>{ticket.artist}</h2>
        <strong>{ticket.event}</strong>
        <p>
          {ticket.venue} · {ticket.city}
        </p>
        <p>
          {formatEventDate(ticket.date, ticket.timezone)} ·{" "}
          {formatEventTime(ticket.date, ticket.timezone)}
        </p>
        <div className="ticket-seat-details">
          <span>
            SECTION<strong>{ticket.section}</strong>
          </span>
          <span>
            ROW<strong>{ticket.row}</strong>
          </span>
          <span>
            SEAT<strong>{ticket.seat}</strong>
          </span>
        </div>
        <small className="ticket-id">{ticket.ticketId}</small>
      </div>
      <div className="ticket-qr">
        <svg
          viewBox={`0 0 ${qr.size} ${qr.size}`}
          role="img"
          aria-label={`Mock ticket QR for section ${ticket.section} row ${ticket.row} seat ${ticket.seat}`}
          shapeRendering="crispEdges"
        >
          <rect width={qr.size} height={qr.size} fill="white" />
          <path d={qr.path} fill="#10121b" />
        </svg>
        <span>DEMO · NOT VALID FOR ENTRY</span>
      </div>
    </article>
  );
}
