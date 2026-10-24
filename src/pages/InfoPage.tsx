import { Link, useLocation } from "react-router-dom";
export default function InfoPage() {
  const path = useLocation().pathname;
  return (
    <div className="info-page">
      <span className="eyebrow">VIBETIX · ENGINEERING PORTFOLIO</span>
      <h1>
        {path === "/privacy"
          ? "Your data in this demo"
          : path === "/terms"
            ? "Demo use and limitations"
            : "A complete booking demo"}
        <span>.</span>
      </h1>
      {path === "/privacy" ? (
        <>
          <p>
            Use fictional names, email addresses and phone numbers, and a
            password you do not use elsewhere. No card information is requested
            or processed.
          </p>
          <p>
            Accounts, password hashes, session hashes, favorites, seat holds and
            demo orders are stored on the server. Account data is isolated by
            signed-in user. The session cookie is HttpOnly; production cookies
            also require HTTPS. Private orders are held in memory in this
            browser, not persisted in localStorage.
          </p>
          <p>
            Non-sensitive cart preferences and chosen seats may use
            localStorage. Logging avoids submitted contact details and
            credentials. Directions and native sharing open the external service
            you choose; only a public event link is shared.
          </p>
          <p>
            This is a disposable demonstration: operators may reset demo
            accounts and orders. There is no email verification, password
            recovery, analytics or real email delivery. Do not use the service
            for personal, payment or legally important records. Sign out on
            shared devices; clearing browser data does not delete server
            records.
          </p>
        </>
      ) : path === "/terms" ? (
        <>
          <p>
            VIBETIX is a software engineering portfolio demo. Every event,
            artist, seating plan, price, fee and benefit is illustrative. There
            are no commercial ticket sales, financial transactions or venue
            affiliations.
          </p>
          <p>
            Reservations coordinate fictional inventory across browsers using
            server transactions and expire automatically. Simulated purchases
            create account-owned demo orders and QR illustrations. They never
            create admission rights and cannot be used at a venue.
          </p>
          <p>
            Mobile tickets stay in your demo account. Email delivery is a
            simulated preference; no message is sent. Demo data can be reset.
            Availability is provided for exploration, with rate limits and no
            promise of permanent account access.
          </p>
        </>
      ) : (
        <>
          <p>
            Explore fictional events, choose exact seats, add extras and
            complete a clearly labelled simulated purchase. Refresh to restore
            server-held seats, view account-owned orders and inspect digital
            demo tickets.
          </p>
          <p>
            React and TypeScript power the interface; Fastify, PostgreSQL,
            Prisma, Redis and a worker enforce ownership, pricing, concurrent
            inventory and expiry. Nothing here processes money or verifies venue
            entry.
          </p>
        </>
      )}
      <Link className="button button-primary" to="/events">
        Explore events →
      </Link>
    </div>
  );
}
