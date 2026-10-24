import { FIXTURE_MODE } from "../../api/client";
import { useState } from "react";
import { Heart, Ticket, Menu, X, ArrowUpRight, UserRound } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Brand } from "../common/Brand";
import { SearchForm } from "../common/SearchForm";
import { defaultEventId } from "../../data/events";
export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const featured = defaultEventId();
  const ticketLink = !featured
    ? "/events"
    : `${location.pathname === "/" || location.pathname.startsWith("/events/") ? location.pathname : `/events/${featured}`}#tickets`;
  const links = ["Events", "Artists", "Venues", "About"];
  return (
    <header className="site-header">
      <div className="nav-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map((label) => (
            <NavLink
              key={label}
              className={
                label === "Events" &&
                (location.pathname === "/" ||
                  location.pathname.startsWith("/events/"))
                  ? "active"
                  : ""
              }
              to={`/${label.toLowerCase()}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <SearchForm />
        <div className="nav-actions">
          {!FIXTURE_MODE && (
            <Link
              to="/account"
              className="icon-button"
              aria-label="Your account"
            >
              <UserRound size={19} />
            </Link>
          )}
          <Link
            className="icon-button favorites-link"
            to="/favorites"
            aria-label="Favorites"
          >
            <Heart size={19} />
          </Link>
          <span className="nav-divider" />
          <Link className="my-tickets" to="/tickets" aria-label="My Tickets">
            <Ticket size={17} />
            <span>My Tickets</span>
          </Link>
          <Link className="button button-primary nav-cta" to={ticketLink}>
            Get Tickets
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <button
          className="icon-button menu-toggle"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </div>
      {menuOpen && (
        <nav
          className="mobile-nav"
          id="mobile-navigation"
          aria-label="Mobile navigation"
        >
          {links.map((label) => (
            <Link
              key={label}
              to={`/${label.toLowerCase()}`}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </Link>
          ))}
          <Link to="/favorites" onClick={() => setMenuOpen(false)}>
            Favorites
          </Link>
          <Link to="/tickets" onClick={() => setMenuOpen(false)}>
            My Tickets
          </Link>
        </nav>
      )}
    </header>
  );
}
