import { useEffect, useRef, useState } from "react";
import { Search, ArrowUpRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { searchCatalog } from "../../services/search";
export function SearchForm() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const container = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebounced(query);
      setActive(-1);
    }, 160);
    return () => clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const results = searchCatalog(debounced);
  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    setActive(-1);
    navigate(path);
  };
  return (
    <div
      className="search-wrap"
      ref={container}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <form
        className="search-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();

          const currentResults =
            query === debounced ? results : searchCatalog(query);
          const result =
            currentResults[query === debounced && active >= 0 ? active : 0];
          if (result) go(result.path);
          else {
            setDebounced(query);
            setActive(-1);
            setOpen(true);
          }
        }}
      >
        <button type="submit" aria-label="Search">
          <Search size={17} />
        </button>
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="global-search-results"
          aria-activedescendant={
            open && active >= 0 && results[active]
              ? results[active].id
              : undefined
          }
          aria-label="Search artists, events, venues, and cities"
          placeholder="Search artists, events, venues..."
          autoComplete="off"
          maxLength={100}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setActive(-1);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(results.length - 1, index + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((index) => Math.max(0, index - 1));
            }
          }}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setActive(-1);
            }}
          >
            <X size={14} />
          </button>
        ) : (
          <kbd>↵</kbd>
        )}
      </form>
      {open && (
        <div className="search-results">
          <div className="search-results-title">
            {debounced ? "Search results" : "Explore the lineup"}
            <button
              type="button"
              aria-label="Close search results"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div
            role="listbox"
            id="global-search-results"
            aria-label="Search results"
          >
            {results.length ? (
              results.map((result, index) => (
                <button
                  key={result.id}
                  id={result.id}
                  role="option"
                  aria-selected={index === active}
                  className={`search-result ${index === active ? "active" : ""}`}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => go(result.path)}
                >
                  <div>
                    <strong>{result.title}</strong>
                    <small>
                      {result.type} · {result.subtitle}
                    </small>
                  </div>
                  <ArrowUpRight size={16} />
                </button>
              ))
            ) : (
              <p className="no-results" role="status">
                No results for “{debounced}”. Try an artist, event, venue, or
                city.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
