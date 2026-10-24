import { useCountdown } from "../../utils/countdown";
export function EventCountdown({ date }: { date: string }) {
  const countdown = useCountdown(date);
  return (
    <>
      <div className="countdown-heading">
        <span className="live-dot" />
        {countdown.started ? "The moment is here" : "THE COUNTDOWN IS ON"}
      </div>
      <div
        className="countdown"
        aria-label={`Concert starts in ${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes`}
      >
        {(["days", "hours", "minutes", "seconds"] as const).map((label) => (
          <div className="countdown-unit" key={label}>
            <strong>{String(countdown[label]).padStart(2, "0")}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </>
  );
}
