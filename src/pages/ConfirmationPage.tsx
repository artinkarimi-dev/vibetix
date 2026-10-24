import { FIXTURE_MODE } from "../api/client";
import { useRemoteOrder } from "../api/ordersApi";
import { useSearchParams, Link } from "react-router-dom";
import { Check, ArrowRight, Mail, Smartphone } from "lucide-react";
import { useOrderStore } from "../store/orderStore";
import { useBookingStore } from "../store/bookingStore";
import { DigitalTicketCard } from "../components/booking/DigitalTicketCard";
import { TicketActions } from "../components/booking/TicketActions";
import { EmptyState } from "../components/common/EmptyState";
import { formatMoney } from "../utils/pricing";
export default function ConfirmationPage() {
  const [params] = useSearchParams();
  const completed = useBookingStore((s) => s.completedOrder);
  const id = params.get("order") ?? completed;
  const order = useOrderStore((s) => s.orders.find((o) => o.id === id));
  const remote = useRemoteOrder(id);
  if (remote.loading)
    return (
      <div className="flow-page" role="status">
        Loading your order…
      </div>
    );
  if (remote.error)
    return (
      <div className="flow-page">
        <h1>Cannot load this order</h1>
        <p role="alert">{remote.error}</p>
        <button className="button button-secondary" onClick={remote.retry}>
          Retry order
        </button>
      </div>
    );
  if (!order)
    return (
      <EmptyState
        title="No confirmation to show"
        description="Complete a test booking to see your tickets here, or find an existing order in My Tickets."
        to="/tickets"
        action="My Tickets"
      />
    );
  return (
    <div className="flow-page confirmation-page">
      <div className="confirmation-heading">
        <span className="confirmation-check">
          <Check size={35} />
        </span>
        <span className="eyebrow">THE NIGHT IS YOURS</span>
        <h1>
          You’re going to {order.eventName}
          <span>!</span>
        </h1>
        <p>
          {order.tickets.length} ticket{order.tickets.length > 1 ? "s" : ""}.
          One unforgettable experience.
        </p>
        <span className="confirmation-order">
          {order.orderNumber} · Test purchase complete
        </span>
      </div>
      <div className="confirmation-info panel">
        <span>
          {order.deliveryMethod === "mobile" ? (
            <Smartphone size={22} />
          ) : (
            <Mail size={22} />
          )}
        </span>
        <div>
          <strong>
            {order.deliveryMethod === "mobile"
              ? "Your mobile tickets are ready"
              : "Your email ticket preference is saved"}
          </strong>
          <p>
            {order.deliveryMethod === "mobile"
              ? FIXTURE_MODE
                ? "Find your tickets here and in My Tickets on this browser."
                : "Find your tickets here and in your account’s My Tickets."
              : `Email delivery to ${order.attendee.email} is simulated. No email has been sent.`}
          </p>
        </div>
        <strong>
          {formatMoney(order.totals.grandTotal)}
          <small>
            {FIXTURE_MODE
              ? "Mock order total"
              : "Order total · simulated payment"}
          </small>
        </strong>
      </div>
      <p className="simulation-banner">
        This is a fictional booking. These tickets are not valid for entry.
      </p>
      {order.ticketNotice && (
        <p className="inline-alert" role="status">
          {order.ticketNotice}
        </p>
      )}
      <div className="digital-ticket-grid">
        {order.tickets.map((ticket) => (
          <DigitalTicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
      <TicketActions order={order} />
      <div className="confirmation-links">
        <Link className="button button-primary" to={`/orders/${order.id}`}>
          View Order Details
          <ArrowRight size={16} />
        </Link>
        <Link className="button button-secondary" to="/tickets">
          My Tickets
        </Link>
        <Link className="text-link" to="/events">
          Discover more nights →
        </Link>
      </div>
    </div>
  );
}
