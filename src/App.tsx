import { lazy, Suspense, type ReactNode } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RequirePerm } from "./auth/guards";
import { FeedbackProvider } from "./components/feedback";
import Layout from "./components/Layout";
import { EmptyState, Loading } from "./components/ui";
import DashboardView from "./pages/DashboardView";
import Home from "./pages/Home";
import Login from "./pages/Login";
import { RecordDetailPage, RecordsPage } from "./pages/Records";

// Admin and operations screens are loaded on demand to keep the viewer bundle small.
const AdvancedSetup = lazy(() => import("./pages/admin/AdvancedSetup"));
const QuickStart = lazy(() => import("./pages/wizard/QuickStart"));
const RunsPage = lazy(() => import("./pages/Operations").then((m) => ({ default: m.RunsPage })));
const SyncLogsPage = lazy(() => import("./pages/Operations").then((m) => ({ default: m.SyncLogsPage })));
const AuditPage = lazy(() => import("./pages/Operations").then((m) => ({ default: m.AuditPage })));

const Lazy = ({ children }: { children: ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="dashboards/:id" element={<RequirePerm perm="dashboards.view"><DashboardView /></RequirePerm>} />
        <Route path="records" element={<RequirePerm perm="records.view"><RecordsPage /></RequirePerm>} />
        <Route path="records/:id" element={<RequirePerm perm="records.view"><RecordDetailPage /></RequirePerm>} />
        <Route path="admin/quick-start" element={<RequirePerm perm="admin.configure"><Lazy><QuickStart /></Lazy></RequirePerm>} />
        <Route path="admin/setup" element={<RequirePerm any={["admin.configure", "admin.users", "dashboards.manage"]}><Lazy><AdvancedSetup /></Lazy></RequirePerm>} />
        <Route path="operations/runs" element={<RequirePerm perm="runs.view"><Lazy><RunsPage /></Lazy></RequirePerm>} />
        <Route path="operations/sync" element={<RequirePerm perm="runs.view"><Lazy><SyncLogsPage /></Lazy></RequirePerm>} />
        <Route path="operations/audit" element={<RequirePerm perm="audit.view"><Lazy><AuditPage /></Lazy></RequirePerm>} />
        <Route path="*" element={<EmptyState title="Page not found." />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  // HashRouter: GitHub Pages has no server-side routing, so deep links use #/path.
  return (
    <HashRouter>
      <AuthProvider>
        <FeedbackProvider>
          <AppRoutes />
        </FeedbackProvider>
      </AuthProvider>
    </HashRouter>
  );
}
