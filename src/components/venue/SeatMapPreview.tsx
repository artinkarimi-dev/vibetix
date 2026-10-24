import { useEffect, useRef, useState } from "react";
import type { TierId } from "../../types";
const sectionColors: Record<TierId, string> = {
  standard: "#597ac7",
  premium: "#9a70db",
  vip: "#df76b0",
  "front-row": "#f6b664",
};
const sections: { id: number; angle: number }[] = Array.from(
  { length: 16 },
  (_, index) => ({ id: 201 + index, angle: index * 22.5 - 90 }),
);

const rings: {
  tier: "standard" | "premium";
  outerX: number;
  outerY: number;
  innerX: number;
  innerY: number;
}[] = [
  { tier: "standard", outerX: 242, outerY: 142, innerX: 188, innerY: 108 },
  { tier: "premium", outerX: 182, outerY: 102, innerX: 133, innerY: 75 },
];
function ellipsePoint(xRadius: number, yRadius: number, angle: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: xRadius * Math.cos(radians), y: yRadius * Math.sin(radians) };
}
function sectionPath(
  outerX: number,
  outerY: number,
  innerX: number,
  innerY: number,
  angle: number,
) {
  const start = ellipsePoint(outerX, outerY, angle - 10.25);
  const end = ellipsePoint(outerX, outerY, angle + 10.25);
  const innerEnd = ellipsePoint(innerX, innerY, angle + 10.25);
  const innerStart = ellipsePoint(innerX, innerY, angle - 10.25);
  return `M ${start.x} ${start.y} A ${outerX} ${outerY} 0 0 1 ${end.x} ${end.y} L ${innerEnd.x} ${innerEnd.y} A ${innerX} ${innerY} 0 0 0 ${innerStart.x} ${innerStart.y} Z`;
}
export function SeatMapPreview({ selectedTier }: { selectedTier: TierId }) {
  const viewport = useRef<SVGSVGElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!viewport.current || typeof IntersectionObserver === "undefined") {
      setReady(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="map-preview">
      <svg
        ref={viewport}
        data-deferred-preview
        data-preview-ready={ready}
        className="arena-svg"
        viewBox="0 0 700 410"
        role="img"
        aria-labelledby="arena-title arena-description"
      >
        <title id="arena-title">Madison Square Garden seating preview</title>
        <desc id="arena-description">
          Schematic arena preview with upper bowl, lower bowl, VIP floor and
          front row. {selectedTier.replace("-", " ")} tier highlighted. Open
          Choose Your Seats for interactive section, row, and seat selection.
        </desc>
        {ready && (
          <>
            <defs>
              <pattern
                id="seat-dots"
                width="9"
                height="9"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="4" cy="4" r="1.2" fill="#ffffff" opacity=".27" />
              </pattern>
              <filter id="stage-glow">
                <feGaussianBlur stdDeviation="7" />
              </filter>
            </defs>
            <g transform="translate(350,213)">
              <ellipse
                rx="262"
                ry="157"
                fill="none"
                stroke="#262d46"
                strokeWidth="1"
              />
              <ellipse
                rx="242"
                ry="142"
                fill="none"
                stroke="#232a40"
                strokeWidth="1"
              />
              {rings.map((ring) =>
                sections.map(({ id, angle }) => {
                  const shape = sectionPath(
                    ring.outerX,
                    ring.outerY,
                    ring.innerX,
                    ring.innerY,
                    angle,
                  );
                  const label = ellipsePoint(
                    (ring.outerX + ring.innerX) / 2,
                    (ring.outerY + ring.innerY) / 2,
                    angle,
                  );
                  return (
                    <g
                      key={`${ring.tier}-${id}`}
                      opacity={selectedTier === ring.tier ? 1 : 0.48}
                    >
                      <path
                        d={shape}
                        fill={sectionColors[ring.tier]}
                        stroke="#0e1220"
                        strokeWidth="3"
                      />
                      <path d={shape} fill="url(#seat-dots)" />
                      <text
                        x={label.x}
                        y={label.y + 3}
                        textAnchor="middle"
                        fill="#e1d8f6"
                        fontSize="9"
                      >
                        {ring.tier === "standard" ? id : id - 100}
                      </text>
                    </g>
                  );
                }),
              )}
              <rect
                x="-68"
                y="-15"
                width="136"
                height="82"
                rx="4"
                fill={sectionColors.vip}
                opacity={selectedTier === "vip" ? 0.9 : 0.32}
              />
              <rect
                x="-68"
                y="-15"
                width="136"
                height="82"
                rx="4"
                fill="url(#seat-dots)"
              />
              <path
                d="M 0 -12 V 65 M -65 27 H 65"
                stroke="#111523"
                strokeWidth="5"
              />
              <text
                x="0"
                y="12"
                textAnchor="middle"
                fill="#e4c9db"
                fontSize="10"
                letterSpacing="2"
              >
                VIP FLOOR
              </text>
              <rect
                x="-68"
                y="-38"
                width="136"
                height="17"
                rx="2"
                fill={sectionColors["front-row"]}
                opacity={selectedTier === "front-row" ? 1 : 0.5}
              />
              <text
                x="0"
                y="-26"
                textAnchor="middle"
                fill="#17131c"
                fontSize="8"
                fontWeight="700"
                letterSpacing="1.5"
              >
                FRONT ROW
              </text>
              <rect
                x="-67"
                y="-78"
                width="134"
                height="31"
                rx="3"
                fill="#b690e4"
                opacity=".18"
                filter="url(#stage-glow)"
              />
              <rect
                x="-65"
                y="-77"
                width="130"
                height="30"
                rx="3"
                fill="#262339"
                stroke="#7d629a"
              />
              <text
                x="0"
                y="-57"
                fill="#e6d8fc"
                textAnchor="middle"
                fontSize="11"
                letterSpacing="4"
              >
                STAGE
              </text>
            </g>
            <text
              x="350"
              y="390"
              textAnchor="middle"
              fill="#6f768f"
              fontSize="10"
              letterSpacing="1.5"
            >
              SCHEMATIC PREVIEW · NOT TO SCALE
            </text>
          </>
        )}
      </svg>
      <div className="map-legend">
        {Object.entries(sectionColors).map(([tier, color]) => (
          <span key={tier} className={tier === selectedTier ? "active" : ""}>
            <i style={{ backgroundColor: color }} />
            {tier.replace("-", " ")}
          </span>
        ))}
      </div>
    </div>
  );
}
