import { Link } from "react-router-dom";
import { ArrowRight, Ticket } from "lucide-react";
export function EmptyState({
  title,
  description,
  to = "/events",
  action = "Explore events",
}: {
  title: string;
  description: string;
  to?: string;
  action?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Ticket size={28} />
      </span>
      <h1>{title}</h1>
      <p>{description}</p>
      <Link className="button button-primary" to={to}>
        {action}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
