import { NavLink, useLocation, useNavigate } from "react-router-dom";

const TINASUZE_LINKS = [
  { to: "/builder/analytics", label: "Page Analytics" },
  { to: "/builder/content", label: "Content Overview" },
  { to: "/builder/editor", label: "Link Editor" },
];

export function DashboardNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isTinasuze = location.pathname.startsWith("/builder");

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
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
            background: "var(--gridline)",
            borderRadius: 8,
            padding: 2,
          }}
        >
          <button
            onClick={() => navigate("/")}
            style={{
              background: !isTinasuze ? "var(--surface-1)" : "transparent",
              color: !isTinasuze ? "var(--text-primary)" : "var(--text-secondary)",
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
              background: isTinasuze ? "var(--surface-1)" : "transparent",
              color: isTinasuze ? "var(--text-primary)" : "var(--text-secondary)",
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

      {isTinasuze && (
        <div style={{ display: "flex", gap: 4, padding: "10px 24px", maxWidth: 1200, margin: "0 auto" }}>
          {TINASUZE_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              style={({ isActive }) => ({
                fontSize: 13,
                fontWeight: 600,
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                background: isActive ? "var(--gridline)" : "transparent",
                borderRadius: 6,
                padding: "6px 12px",
                textDecoration: "none",
              })}
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
