import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/", label: "Social Analytics", end: true },
  { to: "/builder/analytics", label: "Page Analytics" },
  { to: "/builder/content", label: "Content Overview" },
  { to: "/builder/editor", label: "Link Editor" },
];

export function DashboardNav() {
  return (
    <nav
      style={{
        display: "flex",
        gap: 4,
        alignItems: "center",
        padding: "14px 24px",
        borderBottom: "1px solid var(--border)",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 700, marginRight: 16 }}>tinasuze dashboard</span>
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
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
    </nav>
  );
}
