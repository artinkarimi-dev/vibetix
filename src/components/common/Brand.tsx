import { Link } from "react-router-dom";
export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="VIBETIX home">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      VIBE<span>TIX</span>
      <span className="brand-dot">.</span>
    </Link>
  );
}
