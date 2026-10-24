import { FIXTURE_MODE } from "../../api/client";
import { Link } from "react-router-dom";
import { Brand } from "../common/Brand";
import { LockKeyhole } from "lucide-react";
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Brand />
        <span>For the nights you’ll never forget.</span>
        <div>
          <Link to="/about">About</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} VIBETIX. All rights reserved.</span>
        <span>
          <LockKeyhole size={12} />
          {FIXTURE_MODE
            ? "Frontend demo · No payments or ticket sales"
            : "Payments simulated · Tickets not valid for entry"}
        </span>
      </div>
    </footer>
  );
}
