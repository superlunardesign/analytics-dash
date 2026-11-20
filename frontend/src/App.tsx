import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardNav } from "./components/DashboardNav";
import { BuilderAnalyticsPage } from "./pages/BuilderAnalyticsPage";
import { ContentOverviewPage } from "./pages/ContentOverviewPage";
import { LinkEditorPage } from "./pages/LinkEditorPage";
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
          <DashboardLayout>
            <BuilderAnalyticsPage />
          </DashboardLayout>
        }
      />
      <Route
        path="/builder/content"
        element={
          <DashboardLayout>
            <ContentOverviewPage />
          </DashboardLayout>
        }
      />
      <Route
        path="/builder/editor/*"
        element={
          <DashboardLayout>
            <LinkEditorPage />
          </DashboardLayout>
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
