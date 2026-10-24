import { Check, ArrowRight, Sparkles, Ticket, Crown, Gem } from "lucide-react";
import type { TicketTier } from "../../types";
import { useEventStore } from "../../store/eventStore";
import { formatCurrency } from "../../utils/format";
const icons = {
  standard: Ticket,
  premium: Sparkles,
  vip: Crown,
  "front-row": Gem,
};
export function TicketTiers({
  tiers,
  eventId,
}: {
  tiers: TicketTier[];
  eventId: string;
}) {
  const selected = useEventStore(
    (state) => state.selectedTiers[eventId] ?? "premium",
  );
  const selectTier = useEventStore((state) => state.selectTier);
  return (
    <section
      className="ticket-section"
      id="tickets"
      aria-labelledby="tickets-title"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR NIGHT. YOUR WAY.</span>
          <h2 id="tickets-title">
            Find your perfect ticket<span>.</span>
          </h2>
        </div>
        <span className="heading-note">
          Every seat. An unforgettable experience.
        </span>
      </div>
      <div className="tier-grid">
        {tiers.map((tier) => {
          const Icon = icons[tier.id];
          const active = selected === tier.id;
          return (
            <article
              key={tier.id}
              className={`tier-card ${active ? "selected" : ""}`}
            >
              {tier.popular && (
                <span className="popular-badge">
                  <Sparkles size={10} />
                  MOST POPULAR
                </span>
              )}
              <div className="tier-top">
                <span className={`tier-icon ${tier.id}`}>
                  <Icon size={19} />
                </span>
                <span className="tier-name">{tier.name}</span>
                {active && (
                  <span className="selected-check" aria-hidden="true">
                    <Check size={12} />
                  </span>
                )}
              </div>
              <div className="tier-price">
                {formatCurrency(tier.price)}
                <span>/ person</span>
              </div>
              <p>{tier.description}</p>
              <ul>
                {tier.features.map((feature) => (
                  <li key={feature}>
                    <Check size={13} />
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={`button ${active ? "button-primary" : "button-secondary"}`}
                aria-pressed={active}
                onClick={() => selectTier(eventId, tier.id)}
              >
                {active ? "Selected" : `Select ${tier.name}`}
                {active ? <Check size={15} /> : <ArrowRight size={15} />}
              </button>
            </article>
          );
        })}
      </div>
      <p className="ticket-disclaimer">
        Prices in USD, before fees. Availability and benefits are illustrative
        in this demo.
      </p>
    </section>
  );
}
