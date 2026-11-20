import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardNav } from "./components/DashboardNav";
import { RequireTinasuzeAuth } from "./components/RequireTinasuzeAuth";
import { BuilderAnalyticsPage } from "./pages/BuilderAnalyticsPage";
import { ContentOverviewPage } from "./pages/ContentOverviewPage";
import { LinkEditorPage } from "./pages/LinkEditorPage";
import { LoginPage } from "./pages/LoginPage";
import { PublicPage } from "./pages/PublicPage";
import { SocialDashboard } from "./pages/SocialDashboard";

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <DashboardNav />
      {children}
    </div>
  );
}

function App() {
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
            <DashboardLayout>
              <BuilderAnalyticsPage />
            </DashboardLayout>
          </RequireTinasuzeAuth>
        }
      />
      <Route
        path="/builder/content"
        element={
          <RequireTinasuzeAuth>
            <DashboardLayout>
              <ContentOverviewPage />
            </DashboardLayout>
          </RequireTinasuzeAuth>
        }
      />
      <Route
        path="/builder/editor/*"
        element={
          <RequireTinasuzeAuth>
            <DashboardLayout>
              <LinkEditorPage />
            </DashboardLayout>
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
