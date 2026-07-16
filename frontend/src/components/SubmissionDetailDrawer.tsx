import type { FormSchema, FormSubmission } from "../types";
import { formatDateTime } from "../format";

interface SubmissionDetailDrawerProps {
  submission: FormSubmission | null;
  schema: FormSchema | null;
  loading: boolean;
  onClose: () => void;
}

function formatAnswer(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // Wix's scheduling/appointment field shape: {startDate, endDate, timeZone}.
    if (typeof v.startDate === "string") {
      return `${formatDateTime(v.startDate)}${v.timeZone ? ` (${v.timeZone})` : ""}`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

export function SubmissionDetailDrawer({ submission, schema, loading, onClose }: SubmissionDetailDrawerProps) {
  if (!submission && !loading) return null;

  const labelFor = (target: string) => schema?.fields.find((f) => f.target === target)?.label ?? target.replace(/_/g, " ");

  // Order answers by the form's own field order when we have a schema
  // (falls back to insertion order for any answer key the schema doesn't
  // recognize -- e.g. a field deleted from the form after being answered).
  const orderedKeys = submission
    ? [
        ...(schema?.fields.map((f) => f.target).filter((t) => t in submission.fields) ?? []),
        ...Object.keys(submission.fields).filter((k) => !schema?.fields.some((f) => f.target === k)),
      ]
    : [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)",
          height: "100%",
          background: "var(--surface-1)",
          padding: 24,
          overflowY: "auto",
          borderLeft: "1px solid var(--border)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
            color: "var(--text-secondary)",
            marginBottom: 16,
          }}
        >
          Close
        </button>

        {loading && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}

        {submission && (
          <>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--series-orange)",
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 6,
              }}
            >
              {submission.form_name ?? "Form submission"} · {formatDateTime(submission.submitted_at)}
            </div>

            <p style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>
              {submission.contact_name || "Unknown submitter"}
            </p>
            {submission.contact_email && (
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
                <a href={`mailto:${submission.contact_email}`} style={{ color: "var(--series-blue)" }}>
                  {submission.contact_email}
                </a>
              </p>
            )}

            {submission.status && (
              <span
                style={{
                  display: "inline-block",
                  fontSize: 12,
                  background: "var(--gridline)",
                  color: "var(--text-secondary)",
                  borderRadius: 999,
                  padding: "3px 10px",
                  marginBottom: 20,
                }}
              >
                {submission.status}
              </span>
            )}

            <h3 style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Responses</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {orderedKeys.map((target) => {
                const value = submission.fields[target];
                if (value == null || value === "") return null;
                return (
                  <div key={target}>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>{labelFor(target)}</div>
                    <div style={{ fontSize: 14, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                      {formatAnswer(value)}
                    </div>
                  </div>
                );
              })}
              {orderedKeys.every((target) => submission.fields[target] == null || submission.fields[target] === "") && (
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No responses recorded.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
