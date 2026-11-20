import { AnimatePresence, motion } from "framer-motion";
import { Pipette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HexAlphaColorPicker } from "react-colorful";

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

// react-colorful's alpha variant works in 8-digit hex (#RRGGBBAA). Values
// from before this component supported opacity are plain 6-digit hex --
// treated as fully opaque (ff) rather than erroring.
function toHex8(value: string): string {
  const v = (value || "#000000").trim();
  if (/^#[0-9a-fA-F]{8}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return `${v}ff`;
  return "#000000ff";
}

function alphaPercent(hex8: string): number {
  const alphaHex = hex8.slice(7, 9) || "ff";
  return Math.round((parseInt(alphaHex, 16) / 255) * 100);
}

function withAlphaPercent(hex8: string, percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const alphaHex = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex8.slice(0, 7)}${alphaHex}`;
}

// Native EyeDropper API (Chrome/Edge only) -- feature-detected, not
// polyfilled, since there's no good cross-browser equivalent.
const supportsEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hex8 = toHex8(value);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleEyeDropper = async () => {
    try {
      // @ts-expect-error -- EyeDropper isn't in TS's lib.dom.d.ts yet
      const result = await new window.EyeDropper().open();
      if (result?.sRGBHex) onChange(toHex8(result.sRGBHex));
    } catch {
      // user cancelled the eyedropper -- not an error
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", marginBottom: 10 }}>
      <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ minWidth: 70 }}>{label}</span>
        <motion.button
          type="button"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setOpen((v) => !v)}
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "1px solid var(--border)",
            cursor: "pointer",
            padding: 0,
            background: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
            backgroundSize: "8px 8px",
            backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
          }}
        >
          <div style={{ width: "100%", height: "100%", borderRadius: 5, background: hex8 }} />
        </motion.button>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 90,
            background: "var(--surface-1)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 6px",
            fontSize: 12,
          }}
        />
      </label>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              zIndex: 20,
              top: "100%",
              left: 0,
              marginTop: 6,
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            }}
          >
            <HexAlphaColorPicker color={hex8} onChange={onChange} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
              {supportsEyeDropper && (
                <button
                  type="button"
                  onClick={handleEyeDropper}
                  title="Pick a color from your screen"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    background: "var(--gridline)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    cursor: "pointer",
                    color: "var(--text-secondary)",
                  }}
                >
                  <Pipette size={14} />
                </button>
              )}
              <input
                type="text"
                value={hex8}
                onChange={(e) => onChange(toHex8(e.target.value))}
                style={{
                  flex: 1,
                  background: "var(--gridline)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "5px 8px",
                  fontSize: 12,
                  fontFamily: "monospace",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={alphaPercent(hex8)}
                  onChange={(e) => onChange(withAlphaPercent(hex8, Number(e.target.value)))}
                  style={{
                    width: 44,
                    background: "var(--gridline)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "5px 4px",
                    fontSize: 12,
                    textAlign: "right",
                  }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>%</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
