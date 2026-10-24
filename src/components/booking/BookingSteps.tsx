import { Link } from "react-router-dom";
import { Check } from "lucide-react";
const steps = [
  ["Seats", "/seats"],
  ["Extras", "/extras"],
  ["Review", "/review"],
  ["Checkout", "/checkout"],
] as const;
export function BookingSteps({ step }: { step: number }) {
  return (
    <nav className="booking-steps" aria-label="Booking progress">
      {steps.map(([name, path], index) => (
        <span
          className={`booking-step ${index === step ? "current" : index < step ? "complete" : ""}`}
          key={name}
        >
          {index < step ? (
            <Link to={path}>
              <i>
                <Check size={12} />
              </i>
              {name}
            </Link>
          ) : (
            <span aria-current={index === step ? "step" : undefined}>
              <i>{index + 1}</i>
              {name}
            </span>
          )}
          {index < steps.length - 1 && <b />}
        </span>
      ))}
    </nav>
  );
}
