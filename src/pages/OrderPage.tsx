import { useRemoteOrder } from "../api/ordersApi";
import { useParams, Link } from "react-router-dom";
import { useOrderStore } from "../store/orderStore";
import { DigitalTicketCard } from "../components/booking/DigitalTicketCard";
import { TicketActions } from "../components/booking/TicketActions";
import { PricingBreakdown } from "../components/booking/PricingBreakdown";
import { EmptyState } from "../components/common/EmptyState";
import { formatMoney } from "../utils/pricing";
export default function OrderPage() {
  const { orderId } = useParams();
  const order = useOrderStore((s) => s.orders.find((o) => o.id === orderId));
  const remote = useRemoteOrder(orderId);
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
        title="Order not found"
        description="Sign in to the account that owns this demo order. It may also have been removed by a demo data reset."
        to="/tickets"
        action="Back to My Tickets"
      />
    );
  return (
    <div className="flow-page">
      <Link className="back-link" to="/tickets">
        ← My Tickets
      </Link>
      <div className="flow-title">
        <div>
          <span className="eyebrow">
            {order.orderNumber} · CONFIRMED TEST ORDER
          </span>
          <h1>
            {order.artist} · {order.eventName}
            <span>.</span>
          </h1>
          <p>
            {order.venue} · {order.city}
          </p>
        </div>
      </div>
      <p className="simulation-banner">
        Mock tickets · Not valid for entry · No payment charged
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
      <div className="order-detail-grid">
        <section className="panel review-section">
          <h2>Order details</h2>
          <dl>
            <dt>Purchased</dt>
            <dd>{new Date(order.purchaseDate).toLocaleString("en-US")}</dd>
            <dt>Attendee</dt>
            <dd>{order.attendee.fullName}</dd>
            <dt>Email</dt>
            <dd>{order.attendee.email}</dd>
            <dt>Delivery</dt>
            <dd>
              {order.deliveryMethod === "mobile"
                ? "Mobile Tickets"
                : "Email Tickets (simulated)"}
            </dd>
            <dt>Promo</dt>
            <dd>{order.promo ?? "None"}</dd>
          </dl>
          {order.extras.length > 0 && (
            <>
              <h3>Your extras</h3>
              {order.extras.map((extra) => (
                <div className="review-extra-row" key={extra.id}>
                  <span>
                    {extra.name}
                    <small>
                      {extra.quantity} × {formatMoney(extra.unitPriceCents)}
                    </small>
                  </span>
                  <strong>
                    {formatMoney(extra.quantity * extra.unitPriceCents)}
                  </strong>
                </div>
              ))}
            </>
          )}
        </section>
        <section className="panel review-section">
          <h2>Price summary</h2>
          <PricingBreakdown totals={order.totals} />
        </section>
      </div>
    </div>
  );
}
