import { profileRender } from "../../utils/profile";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ticketTiers } from "../../data/ticketTiers";
import { getSections, getSectionAvailability } from "../../data/inventory";
import { formatMoney } from "../../utils/pricing";
import type { TierId, VenueSection } from "../../types";
const colors: Record<TierId, string> = {
  standard: "#6d9cf4",
  premium: "#b88beb",
  vip: "#f080ba",
  "front-row": "#efbd74",
};
function point(rx: number, ry: number, angle: number) {
  const a = (angle * Math.PI) / 180;
  return { x: 350 + rx * Math.cos(a), y: 235 + ry * Math.sin(a) };
}
function wedge(section: VenueSection) {
  const outer = section.level === "upper";
  const rx = outer ? 292 : 216,
    ry = outer ? 174 : 126,
    ix = outer ? 230 : 155,
    iy = outer ? 137 : 91;
  const a = section.index * 18 - 90;
  const p = point(rx, ry, a - 8),
    q = point(rx, ry, a + 8),
    r = point(ix, iy, a + 8),
    s = point(ix, iy, a - 8);
  return {
    path: `M${p.x},${p.y} A${rx},${ry} 0 0 1 ${q.x},${q.y} L${r.x},${r.y} A${ix},${iy} 0 0 0 ${s.x},${s.y} Z`,
    label: point((rx + ix) / 2, (ry + iy) / 2, a),
  };
}
interface MapSectionProps {
  section: VenueSection;
  active: boolean;
  available: number;
  onView: (id: string) => void;
  onHover: (section: VenueSection | null) => void;
}
// Section geometry/inventory are stable. Viewing one section changes only the old/new section.
const MapSection = memo(function MapSection({
  section,
  active,
  available,
  onView,
  onHover,
}: MapSectionProps) {
  const floor = section.level === "floor";
  const shape = floor ? null : wedge(section);
  const x = 253 + (section.index % 3) * 67,
    y = section.index < 3 ? 176 : 242;
  return (
    <g
      data-section-id={section.id}
      data-render-count={profileRender("section:" + section.id)}
      role="button"
      tabIndex={0}
      aria-label={`${section.name}, ${section.tierId.replace("-", " ")}, ${available} available seats`}
      aria-pressed={active}
      className={`arena-section ${active ? "active" : ""}`}
      onClick={() => onView(section.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(section.id);
        }
      }}
      onMouseEnter={() => onHover(section)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(section)}
      onBlur={() => onHover(null)}
      style={{ color: colors[section.tierId] }}
    >
      <title>
        {section.name} ·{" "}
        {formatMoney(
          (ticketTiers.find((t) => t.id === section.tierId)?.price ?? 0) * 100,
        )}{" "}
        · {available} available
      </title>
      {floor ? (
        <rect x={x} y={y} width={60} height={56} rx={3} />
      ) : (
        <path d={shape?.path} />
      )}
      <text
        x={floor ? x + 30 : shape?.label.x}
        y={floor ? y + 33 : (shape?.label.y ?? 0) + 4}
        textAnchor="middle"
      >
        {section.id}
      </text>
    </g>
  );
});
export const ArenaMap = memo(function ArenaMap({
  eventId,
  venueId,
  viewingSection,
  onView,
  zoom = 1,
  inventoryRevision = 0,
}: {
  eventId: string;
  venueId: string;
  viewingSection: string | null;
  onView: (id: string) => void;
  zoom?: number;
  inventoryRevision?: number;
}) {
  const [hover, setHover] = useState<VenueSection | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (node) node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2;
  }, [zoom]);
  const sections = useMemo(() => getSections(venueId), [venueId]);
  const availability = useMemo(
    () =>
      Object.fromEntries(
        sections.map((s) => [s.id, getSectionAvailability(eventId, s)]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Mutable inventory cache is invalidated by this explicit revision.
    [eventId, sections, inventoryRevision],
  );
  return (
    <div data-render-count={profileRender("arena")} className="arena-map">
      <p className="arena-pan-hint">
        Swipe to explore the arena, or jump to a section below.
      </p>
      <div
        className="arena-scroll"
        ref={viewport}
        tabIndex={0}
        role="group"
        aria-label="Scrollable arena map"
      >
        <div
          className="arena-geometry"
          style={{
            width: `${zoom * 100}%`,
            minWidth: `calc(var(--arena-min-width, 0px) * ${zoom})`,
          }}
        >
          <svg
            viewBox="0 0 700 465"
            role="group"
            aria-label="Concert arena, choose a section"
          >
            <defs>
              <linearGradient id="stage-fill" x2="0" y2="1">
                <stop stopColor="#423253" />
                <stop offset="1" stopColor="#201e30" />
              </linearGradient>
            </defs>
            <ellipse
              cx="350"
              cy="235"
              rx="307"
              ry="187"
              fill="none"
              stroke="#2b2d43"
            />
            <ellipse
              cx="350"
              cy="235"
              rx="224"
              ry="134"
              fill="none"
              stroke="#202739"
            />
            {sections.map((section) => (
              <MapSection
                key={section.id}
                section={section}
                active={viewingSection === section.id}
                available={availability[section.id]}
                onView={onView}
                onHover={setHover}
              />
            ))}
            <rect
              x="252"
              y="150"
              width="196"
              height="20"
              rx="4"
              fill="url(#stage-fill)"
              stroke="#9c79bd"
            />
            <text
              x="350"
              y="164"
              textAnchor="middle"
              fill="#f5e6ff"
              fontSize="10"
              letterSpacing="5"
            >
              STAGE
            </text>
            <path
              d="M265 172 L245 181 M435 172 L455 181"
              stroke="#a972c5"
              opacity=".45"
            />
            <text
              x="350"
              y="438"
              textAnchor="middle"
              fill="#979cb6"
              fontSize="10"
              letterSpacing="1.5"
            >
              ILLUSTRATIVE CONCERT CONFIGURATION
            </text>
          </svg>
        </div>
      </div>
      <div className="arena-tooltip" role="status">
        {hover ? (
          <>
            <strong>{hover.name}</strong>
            <span>
              {ticketTiers.find((t) => t.id === hover.tierId)?.name} ·{" "}
              {formatMoney(
                (ticketTiers.find((t) => t.id === hover.tierId)?.price ?? 0) *
                  100,
              )}{" "}
              · {availability[hover.id]} available
            </span>
          </>
        ) : (
          <>
            <strong>Find your view</strong>
            <span>
              Hover or focus a section for details. Click to view exact seats.
            </span>
          </>
        )}
      </div>
      <div className="map-legend">
        {ticketTiers.map((tier) => (
          <span key={tier.id}>
            <i style={{ backgroundColor: colors[tier.id] }} />
            {tier.name}
          </span>
        ))}
      </div>
    </div>
  );
});
