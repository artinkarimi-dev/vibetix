import { useRemoteOrders } from "../api/ordersApi";
import { FIXTURE_MODE } from "../api/client";
import { Link } from "react-router-dom";
import { ArrowRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { useOrderStore } from "../store/orderStore";
import { EmptyState } from "../components/common/EmptyState";
import { formatMoney } from "../utils/pricing";
import { formatEventDate } from "../utils/format";
export default function TicketsPage() {
  const remote = useRemoteOrders();
  const orders = useOrderStore((s) => s.orders);
  const remove = useOrderStore((s) => s.deleteOrder);
  const [deleting, setDeleting] = useState<string | null>(null);
  if (remote.loading)
    return (
      <div className="flow-page" role="status">
        Refreshing your demo tickets…
      </div>
    );
  if (remote.error)
    return (
      <div className="flow-page">
        <h1>Cannot load demo orders</h1>
        <p role="alert">{remote.error}</p>
        <button className="button button-secondary" onClick={remote.retry}>
          Retry orders
        </button>
        <Link to="/account">Sign in</Link>
      </div>
    );
  if (!orders.length)
    return (
      <EmptyState
        title="Your next great night is waiting"
        description="Sign in to view your server orders, or find a show and complete a simulated payment."
      />
    );
  return (
    <div className="flow-page">
      <div className="flow-title">
        <div>
          <span className="eyebrow">ALL YOUR NIGHTS. ONE PLACE.</span>
          <h1>
            My Tickets<span>.</span>
          </h1>
          <p>
            {FIXTURE_MODE
              ? "Mock orders saved on this browser. No account or real booking is created."
              : "Orders saved to your account. Payments are simulated; tickets are not valid for admission."}
          </p>
        </div>
        <Link className="button button-secondary" to="/events">
          Find another show
          <ArrowRight size={16} />
        </Link>
      </div>
      <div className="orders-grid">
        {orders.map((order) => (
          <article className="order-card panel" key={order.id}>
            <span className="eyebrow">{order.orderNumber}</span>
            <h2>
              {order.artist} · {order.eventName}
            </h2>
            <p>
              {formatEventDate(order.startsAt, order.timezone)}
              <br />
              {order.venue} · {order.city}
            </p>
            {order.ticketNotice && <p role="status">{order.ticketNotice}</p>}
            <div>
              <span>
                {order.tickets.length} ticket
                {order.tickets.length > 1 ? "s" : ""} ·{" "}
                {order.deliveryMethod === "mobile" ? "Mobile" : "Email"}{" "}
                delivery
              </span>
              <strong>{formatMoney(order.totals.grandTotal)}</strong>
            </div>
            <Link className="button button-primary" to={`/orders/${order.id}`}>
              View Tickets
              <ArrowRight size={16} />
            </Link>
            {FIXTURE_MODE &&
              (deleting === order.id ? (
                <div className="delete-confirm">
                  <p>
                    Delete this local mock order and its saved contact details?
                  </p>
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      remove(order.id);
                      setDeleting(null);
                    }}
                  >
                    Delete order
                  </button>
                  <button
                    className="text-link"
                    onClick={() => setDeleting(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="delete-order"
                  onClick={() => setDeleting(order.id)}
                >
                  <Trash2 size={13} />
                  Delete local mock order
                </button>
              ))}
          </article>
        ))}
      </div>
      {remote.nextCursor && (
        <button className="button button-secondary" onClick={remote.more}>
          Load older orders
        </button>
      )}
    </div>
  );
}
