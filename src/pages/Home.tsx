import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EmptyState, PageHeader } from "../components/ui";

/** Sends each user to their assigned default dashboard. */
export default function Home() {
  const { user, can } = useAuth();
  if (user?.default_dashboard_id) return <Navigate to={`/dashboards/${user.default_dashboard_id}`} replace />;
  return (
    <>
      <PageHeader title={`Welcome, ${user?.name ?? ""}`} />
      <EmptyState title="No dashboard has been assigned to you yet.">
        {can("admin.configure") ? <>Start with <Link to="/admin/quick-start">Quick Start</Link>, then build a dashboard in <Link to="/admin/setup?section=dashboards">Advanced Setup</Link>.</>
          : can("records.view") ? <>You can still browse <Link to="/records">records</Link> in your scope. Ask your QA administrator to assign a dashboard.</>
            : "Ask your QA administrator to assign a dashboard or role."}
      </EmptyState>
    </>
  );
}
