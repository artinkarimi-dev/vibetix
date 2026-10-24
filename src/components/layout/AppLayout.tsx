import { useEventStore } from "../../store/eventStore";
import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { getEventDetails } from "../../services/catalog";
import { defaultEventId } from "../../data/events";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { HoldExpiryManager } from "../booking/BookingGuard";
import { StorageNotice } from "../common/StorageNotice";
export function AppLayout() {
  const accountError = useEventStore((s) => s.networkError);
  const { pathname, hash } = useLocation();
  const previousPath = useRef(pathname);
  useEffect(() => {
    const event =
      pathname === "/"
        ? getEventDetails(defaultEventId() ?? "")
        : pathname.startsWith("/events/")
          ? getEventDetails(pathname.split("/")[2])
          : undefined;
    const description = document.querySelector('meta[name="description"]');
    if (description)
      description.setAttribute(
        "content",
        event
          ? `${event.artist.name} · ${event.event.name}. Fictional portfolio demo; no payments or admission.`
          : "VIBETIX engineering portfolio demo: discover fictional events and explore server-backed booking. No payments or venue admission.",
      );
    document.title = event
      ? `${event.artist.name} · ${event.event.name} | VIBETIX`
      : `${pathname.split("/")[1].replace(/^[a-z]/, (c) => c.toUpperCase())} | VIBETIX`;
  }, [pathname]);
  useEffect(() => {
    if (hash)
      document.getElementById(hash.slice(1))?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
    else {
      window.scrollTo(0, 0);
      if (previousPath.current !== pathname)
        document.getElementById("main-content")?.focus({ preventScroll: true });
    }
    previousPath.current = pathname;
  }, [pathname, hash]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      <StorageNotice />
      {accountError && (
        <p className="inline-alert" role="alert">
          {accountError}
        </p>
      )}
      <HoldExpiryManager />
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
