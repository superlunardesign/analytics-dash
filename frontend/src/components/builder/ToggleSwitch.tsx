import { motion } from "framer-motion";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: 12,
        color: "var(--text-secondary)",
        padding: 0,
      }}
    >
      <span>{label}</span>
      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 999,
          background: checked ? "var(--series-blue)" : "var(--gridline)",
          padding: 2,
          display: "flex",
          justifyContent: checked ? "flex-end" : "flex-start",
          transition: "background 0.2s",
        }}
      >
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 700, damping: 35 }}
          style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
        />
      </div>
    </button>
  );
}
