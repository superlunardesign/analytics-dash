import { useEffect, useRef, useState } from "react";
import { analyzeVideo, getVideoAnalysis } from "../api";
import type { PostDetail, VideoAnalysis } from "../types";
import { formatNumber } from "../format";

interface VideoAnalysisSectionProps {
  post: PostDetail;
}

// Mirrors the Video Analyzer's own trigger_analysis goal options --
// viral_reach is its own default when left blank.
const GOAL_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Viral reach (default)" },
  { value: "lead_generation", label: "Lead generation" },
  { value: "sales_conversions", label: "Sales / conversions" },
  { value: "follower_growth", label: "Follower growth" },
  { value: "engagement", label: "Engagement" },
];

const SCORE_LABELS: Record<string, string> = {
  hook_strength: "Hook strength",
  promise_clarity: "Promise clarity",
  retention_design: "Retention design",
  engagement_potential: "Engagement potential",
  viral_potential: "Viral potential",
  satisfaction_delivery: "Satisfaction delivery",
  goal_alignment: "Goal alignment",
};

// Polling while a run is processing -- analyses take 3-9 minutes, so this
// just needs to be frequent enough to feel responsive without hammering
// the backend (which itself only re-checks the analyzer when asked).
const POLL_INTERVAL_MS = 8000;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h4 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>{title}</h4>
      <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap", margin: 0 }}>
        {children}
      </p>
    </div>
  );
}

export function VideoAnalysisSection({ post }: VideoAnalysisSectionProps) {
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [checkedOnce, setCheckedOnce] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    setAnalysis(null);
    setCheckedOnce(false);
    setError(null);
    stopPolling();

    let cancelled = false;
    (async () => {
      try {
        const result = await getVideoAnalysis(post.id);
        if (!cancelled) setAnalysis(result);
      } catch {
        // No analysis yet -- the normal, expected state for most posts,
        // not an error worth showing.
      } finally {
        if (!cancelled) setCheckedOnce(true);
      }
    })();

    return () => {
      cancelled = true;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  useEffect(() => {
    if (analysis?.status === "processing" && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        try {
          const result = await getVideoAnalysis(post.id);
          setAnalysis(result);
          if (result.status !== "processing") stopPolling();
        } catch {
          // transient -- keep polling
        }
      }, POLL_INTERVAL_MS);
    }
    if (analysis?.status !== "processing") stopPolling();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.status, post.id]);

  if (!post.permalink) return null;

  const handleAnalyze = async (force = false) => {
    setStarting(true);
    setError(null);
    try {
      setAnalysis(await analyzeVideo(post.id, goal, force));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start analysis");
    } finally {
      setStarting(false);
    }
  };

  const data = analysis?.raw_payload;
  const scores = data?.scores ?? {};
  const scoreEntries = Object.entries(scores).filter(([, v]) => typeof v === "number");

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--gridline)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>Video analysis</h3>
        {checkedOnce && (!analysis || analysis.status === "failed") && (
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            style={{
              background: "var(--surface-1)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "3px 6px",
              fontSize: 12,
            }}
          >
            {GOAL_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {!checkedOnce && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Checking…</p>}

      {checkedOnce && (!analysis || analysis.status === "failed") && (
        <>
          {analysis?.status === "failed" && (
            <p style={{ fontSize: 12, color: "var(--series-red, #d64545)", marginBottom: 8 }}>
              Last attempt failed{analysis.error_message ? `: ${analysis.error_message}` : "."}
            </p>
          )}
          <button
            onClick={() => handleAnalyze(false)}
            disabled={starting}
            style={{
              background: "var(--series-violet)",
              border: "none",
              borderRadius: 6,
              padding: "6px 14px",
              color: "#fff",
              cursor: starting ? "default" : "pointer",
              opacity: starting ? 0.6 : 1,
              fontSize: 13,
            }}
          >
            {starting ? "Starting…" : analysis?.status === "failed" ? "Retry analysis" : "Analyze"}
          </button>
          {error && <p style={{ fontSize: 12, color: "var(--series-red, #d64545)", marginTop: 8 }}>{error}</p>}
        </>
      )}

      {analysis?.status === "processing" && (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Analyzing… this usually takes 3-9 minutes. This panel updates on its own — no need to keep this open.
        </p>
      )}

      {analysis?.status === "completed" && data && (
        <div>
          {scoreEntries.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 12px", marginBottom: 14 }}>
              {scoreEntries.map(([key, value]) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-secondary)" }}>{SCORE_LABELS[key] ?? key}</span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{value as number}/10</span>
                </div>
              ))}
            </div>
          )}

          {data.content_goal?.goal_type && (
            <span
              style={{
                display: "inline-block",
                fontSize: 12,
                background: "var(--gridline)",
                color: "var(--text-secondary)",
                borderRadius: 999,
                padding: "3px 10px",
                marginBottom: 12,
              }}
            >
              {data.content_goal.goal_type.replace(/_/g, " ")}
              {data.niche && data.niche !== "general" ? ` · ${data.niche}` : ""}
            </span>
          )}

          {data.what_this_video_is && <Section title="What this video is">{data.what_this_video_is}</Section>}
          {data.why_it_performed && <Section title="Why it performed">{data.why_it_performed}</Section>}
          {data.improvements && <Section title="Improvements">{data.improvements}</Section>}
          {data.follow_up_ideas && <Section title="Follow-up ideas">{data.follow_up_ideas}</Section>}

          {(typeof data.like_count === "number" || typeof data.share_count === "number") && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
              At analysis time: {typeof data.like_count === "number" ? `${formatNumber(data.like_count)} likes` : ""}
              {typeof data.like_count === "number" && typeof data.share_count === "number" ? " · " : ""}
              {typeof data.share_count === "number" ? `${formatNumber(data.share_count)} shares` : ""}
            </p>
          )}

          {(data.viral_mechanics || data.performance_prediction || data.transcript) && (
            <details style={{ marginBottom: 10 }}>
              <summary style={{ fontSize: 12, color: "var(--series-blue)", cursor: "pointer" }}>
                More detail (viral mechanics, prediction, transcript)
              </summary>
              <div style={{ marginTop: 10 }}>
                {data.viral_mechanics && <Section title="Viral mechanics">{data.viral_mechanics}</Section>}
                {data.performance_prediction && (
                  <Section title="Performance prediction">{data.performance_prediction}</Section>
                )}
                {data.transcript && <Section title="Transcript">{data.transcript}</Section>}
              </div>
            </details>
          )}

          <button
            onClick={() => handleAnalyze(true)}
            disabled={starting}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              color: "var(--text-muted)",
              cursor: starting ? "default" : "pointer",
              fontSize: 12,
            }}
          >
            Re-analyze
          </button>
        </div>
      )}
    </div>
  );
}
