import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface ToastItem {
  id: number;
  message: string;
  variant: "error" | "success";
}

export function useToastStack() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastItem["variant"] = "error") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 100, display: "flex", flexDirection: "column", gap: 8 }}>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: t.variant === "error" ? "#3a1518" : "#15301d",
              color: "#fff",
              border: `1px solid ${t.variant === "error" ? "#d64545" : "#3fae63"}`,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              maxWidth: 340,
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}
          >
            {t.variant === "error" ? (
              <AlertCircle size={16} color="#ff8a8a" style={{ flexShrink: 0 }} />
            ) : (
              <CheckCircle2 size={16} color="#6fe396" style={{ flexShrink: 0 }} />
            )}
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              style={{ background: "none", border: "none", color: "#fff", opacity: 0.7, cursor: "pointer", flexShrink: 0, display: "flex" }}
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
