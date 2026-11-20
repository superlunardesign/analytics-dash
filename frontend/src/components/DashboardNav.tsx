import { LogOut } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { logout } from "../api";
import { TINASUZE_ACCENT, TINASUZE_TEXT, TINASUZE_TEXT_MUTED } from "../tinasuzeTheme";

const TINASUZE_LINKS = [
  { to: "/builder/analytics", label: "Analytics" },
  { to: "/builder/content", label: "Content Overview" },
  { to: "/builder/editor", label: "Link Editor" },
];

export function DashboardNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isTinasuze = location.pathname.startsWith("/builder");

  return (
    <div style={{ borderBottom: isTinasuze ? "none" : "1px solid var(--border)" }}>
      {/* Brand switcher -- small and out of the way; not part of either
          brand's own design, just the meta-level control to jump between
          them. */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          padding: "14px 24px 0",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 2,
            background: isTinasuze ? "rgba(21,17,13,0.06)" : "var(--gridline)",
            borderRadius: 8,
            padding: 2,
          }}
        >
          <button
            onClick={() => navigate("/")}
            style={{
              background: !isTinasuze ? "var(--surface-1)" : "transparent",
              color: !isTinasuze ? "var(--text-primary)" : TINASUZE_TEXT_MUTED,
              border: "none",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Superlunar
          </button>
          <button
            onClick={() => navigate("/builder/analytics")}
            style={{
              background: isTinasuze ? "#ffffff" : "transparent",
              color: isTinasuze ? TINASUZE_TEXT : "var(--text-secondary)",
              border: "none",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Tinasuze
          </button>
        </div>
      </div>

      {isTinasuze ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px 10px",
            maxWidth: 1400,
            margin: "0 auto",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, color: TINASUZE_TEXT, letterSpacing: -0.3 }}>tinasuze dashboard</div>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {TINASUZE_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                style={({ isActive }) => ({
                  fontSize: 14,
                  fontWeight: 700,
                  color: isActive ? TINASUZE_ACCENT : TINASUZE_TEXT,
                  textDecoration: "none",
                })}
              >
                {link.label}
              </NavLink>
            ))}
            <button
              onClick={() => logout().finally(() => navigate("/builder/login"))}
              title="Log out"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "transparent",
                color: TINASUZE_TEXT_MUTED,
                border: "none",
                padding: 0,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
