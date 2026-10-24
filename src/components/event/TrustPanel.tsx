import { BadgeCheck, Zap, ShieldCheck, Flame } from "lucide-react";
const promises = [
  {
    icon: BadgeCheck,
    title: "Exact Seat Selection",
    copy: "Explore sections, rows, and numbered seats.",
    color: "purple",
  },
  {
    icon: Zap,
    title: "Instant Confirmation",
    copy: "Demo tickets saved to your account.",
    color: "blue",
  },
  {
    icon: ShieldCheck,
    title: "Test Checkout",
    copy: "Simulate a purchase with test details only.",
    color: "green",
  },
  {
    icon: Flame,
    title: "Your Next Great Night",
    copy: "Fictional lineup. Real concert energy.",
    color: "pink",
  },
];
export function TrustPanel() {
  return (
    <aside className="trust-panel" aria-label="Ticketing experience">
      <span className="eyebrow">GOOD TIMES. PEACE OF MIND.</span>
      {promises.map(({ icon: Icon, title, copy, color }) => (
        <div className="trust-item" key={title}>
          <span className={`trust-icon ${color}`}>
            <Icon size={20} />
          </span>
          <div>
            <strong>{title}</strong>
            <p>{copy}</p>
          </div>
        </div>
      ))}
      <div className="trust-footer">
        <span className="live-dot" />
        Made for the fans. Built for the moment.
      </div>
    </aside>
  );
}
