import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardNav } from "./components/DashboardNav";
import { RequireTinasuzeAuth } from "./components/RequireTinasuzeAuth";
import { BuilderAnalyticsPage } from "./pages/BuilderAnalyticsPage";
import { ContentOverviewPage } from "./pages/ContentOverviewPage";
import { LinkEditorPage } from "./pages/LinkEditorPage";
import { LoginPage } from "./pages/LoginPage";
import { PublicPage } from "./pages/PublicPage";
import { SocialDashboard } from "./pages/SocialDashboard";
import { TINASUZE_GRADIENT } from "./tinasuzeTheme";

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <DashboardNav />
      {children}
    </div>
  );
}

// Tinasuze's own warm-gradient brand background, fixed (not theme/dark-mode
// aware -- see tinasuzeTheme.ts) and scoped to just her side of the app so
// Superlunar's dashboard is untouched.
function TinasuzeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: TINASUZE_GRADIENT }}>
      <DashboardNav />
      {children}
    </div>
  );
}

// This build is deployed TWICE as two separate Render static sites from
// the same repo: "analytics-dash-frontend" (the dashboard + editor, no
// env var set) and a second dedicated site that only ever shows the one
// public bio page, with VITE_PUBLIC_PAGE_SLUG set at build time and a
// creator's custom domain attached to it instead. Since the dashboard
// site never sets this var, there's no host-sniffing needed -- its mere
// presence at build time is enough to know which of the two this is.
const PUBLIC_DOMAIN_SLUG = import.meta.env.VITE_PUBLIC_PAGE_SLUG as string | undefined;

function App() {
  if (PUBLIC_DOMAIN_SLUG) {
    return <PublicPage slugOverride={PUBLIC_DOMAIN_SLUG} />;
  }

  return (
    <Routes>
      {/* The actual visitor-facing page -- deliberately outside
          DashboardLayout, no nav/chrome, nothing private. */}
      <Route path="/p/:slug" element={<PublicPage />} />

      {/* Not wrapped in RequireTinasuzeAuth -- it's the page you land on
          to BECOME authenticated, and has no nav chrome of its own. */}
      <Route path="/builder/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <DashboardLayout>
            <SocialDashboard />
          </DashboardLayout>
        }
      />
      <Route
        path="/builder/analytics"
        element={
          <RequireTinasuzeAuth>
            <TinasuzeLayout>
              <BuilderAnalyticsPage />
            </TinasuzeLayout>
          </RequireTinasuzeAuth>
        }
      />
      <Route
        path="/builder/content"
        element={
          <RequireTinasuzeAuth>
            <TinasuzeLayout>
              <ContentOverviewPage />
            </TinasuzeLayout>
          </RequireTinasuzeAuth>
        }
      />
      <Route
        path="/builder/editor/*"
        element={
          <RequireTinasuzeAuth>
            <TinasuzeLayout>
              <LinkEditorPage />
            </TinasuzeLayout>
          </RequireTinasuzeAuth>
        }
      />

      {/* Anything else (e.g. a hosting rewrite rule misconfigured as a
          redirect to /index.html, which otherwise matches nothing here
          and renders a blank page) lands on the dashboard home instead
          of a blank screen with no explanation. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
