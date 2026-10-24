import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Dashboard, WidgetResult } from "../api/types";
import { WidgetView } from "../components/WidgetView";
import { Badge, Button, EmptyState, ErrorState, Loading, PageHeader } from "../components/ui";
import { useLoad } from "../hooks/useLoad";

export default function DashboardView() {
  const { id } = useParams();
  const dashboard = useLoad(() => api<Dashboard>(`/dashboards/${id}/`), [id]);
  const data = useLoad(() => api<{ widgets: WidgetResult[] }>(`/dashboards/${id}/data/`), [id]);

  if (dashboard.loading && !dashboard.data) return <Loading label="Loading dashboard…" />;
  if (dashboard.error) {
    return dashboard.status === 404 || dashboard.status === 403
      ? <ErrorState status={403} message="" />
      : <ErrorState message={dashboard.error} onRetry={dashboard.reload} />;
  }
  const d = dashboard.data!;
  const results = new Map((data.data?.widgets ?? []).map((w) => [w.id, w]));
  return (
    <>
      <PageHeader title={d.name} subtitle={<>{d.description} {!d.is_published && <Badge tone="warning">draft - only dashboard managers can see this</Badge>}</>}
        actions={<Button onClick={() => void data.reload()} busy={data.loading}>Refresh</Button>} />
      <p className="small muted">Figures include only records within your unit/department access. Overdue items are for offline follow-up and are never emailed.</p>
      {data.error && <ErrorState message={data.error} onRetry={data.reload} />}
      {d.widgets.length === 0 ? <EmptyState title="This dashboard has no widgets yet." /> : (
        <div className="widget-grid">
          {d.widgets.map((w) => (
            <section key={w.id} className={`card widget span-${Math.min(3, Math.max(1, w.width))}`} aria-label={w.title}>
              <header className="card-header"><h3>{w.title}</h3></header>
              <WidgetView widget={w} result={data.loading && !data.data ? undefined : results.get(w.id)} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
