import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, download, type Page } from "../api/client";
import { loadCategories, loadDepartments, loadUnits, toOptions } from "../api/lookups";
import type { RecordItem } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useFeedback } from "../components/feedback";
import { Badge, Button, Callout, Card, EmptyState, ErrorState, KeyValue, Loading, PageHeader, Select, TextInput } from "../components/ui";
import { fmtDate } from "../lib/format";
import { useLoad } from "../hooks/useLoad";

const FILTER_KEYS = ["category", "unit", "department", "status", "q", "due", "issues", "widget", "group", "page"] as const;

export function RecordsPage() {
  const [params, setParams] = useSearchParams();
  const { can } = useAuth();
  const { fail } = useFeedback();
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const query = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ""]));
  const categories = useLoad(loadCategories, []);
  const units = useLoad(loadUnits, []);
  const departments = useLoad(loadDepartments, []);
  const records = useLoad(() => api<Page<RecordItem>>("/records/", { query: { ...query, page_size: 50 } }), [params.toString()]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    if (key !== "widget" && key !== "group") {
      next.delete("widget");
      next.delete("group");
      next.delete("title");
    }
    setParams(next);
  };
  const page = Number(params.get("page") || 1);
  const totalPages = records.data ? Math.max(1, Math.ceil(records.data.count / 50)) : 1;

  const exportCsv = async () => {
    setExporting(true);
    try {
      await download("/records/export/", query, "qa-records.csv");
    } catch (err) {
      fail(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader title="Records" subtitle="Current open records within your unit/department access."
        actions={can("records.export") && <Button busy={exporting} onClick={() => void exportCsv()}>Export CSV</Button>} />
      {params.get("widget") && (
        <Callout tone="info" title={`Filtered from dashboard: ${params.get("title") ?? "widget"}${params.get("group") ? ` → ${params.get("group")}` : ""}`}>
          <Button variant="ghost" onClick={() => setParams(new URLSearchParams())}>Clear dashboard filter</Button>
        </Callout>
      )}
      <Card>
        <div className="filters">
          <Select value={query.category} onChange={(v) => setFilter("category", v)} placeholder="All categories" options={toOptions(categories.data)} />
          <Select value={query.unit} onChange={(v) => setFilter("unit", v)} placeholder="All units" options={toOptions(units.data)} />
          <Select value={query.department} onChange={(v) => setFilter("department", v)} placeholder="All departments" options={toOptions(departments.data)} />
          <Select value={query.due} onChange={(v) => setFilter("due", v)} placeholder="Any target date" options={[
            { value: "today", label: "Due today" }, { value: "upcoming", label: "Due in next 7 days" }, { value: "overdue", label: "Overdue (follow up offline)" }, { value: "no_date", label: "Missing target date" }]} />
          <Select value={query.issues} onChange={(v) => setFilter("issues", v)} placeholder="All records" options={[{ value: "true", label: "Only records with data issues" }]} />
          <form className="inline" onSubmit={(e) => { e.preventDefault(); setFilter("q", search); }}>
            <TextInput value={search} onChange={setSearch} placeholder="Search ID or title" />
            <Button type="submit">Search</Button>
          </form>
        </div>
        {records.loading && !records.data ? <Loading /> : records.error ? <ErrorState message={records.error} status={records.status} onRetry={records.reload} /> :
          !records.data?.results.length ? <EmptyState title="No records match these filters." /> : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>ID</th><th>Category</th><th>Title</th><th>Unit / Department</th><th>Status</th><th>Target date</th><th>Parent</th></tr></thead>
                  <tbody>
                    {records.data.results.map((r) => (
                      <tr key={r.id}>
                        <td data-label="ID"><Link to={`/records/${r.id}`}>{r.source_id}</Link> {r.issues.length > 0 && <Badge tone="warning">{r.issues.length} issue(s)</Badge>}</td>
                        <td data-label="Category">{r.category_name}</td>
                        <td data-label="Title">{r.title}</td>
                        <td data-label="Unit / Dept">{r.unit_name} / {r.department_name}</td>
                        <td data-label="Status">{r.status}</td>
                        <td data-label="Target date">{fmtDate(r.data.target_date as string | null)}</td>
                        <td data-label="Parent" className="small">{r.parent_summary ? `${r.parent_summary.category} ${r.parent_summary.source_id}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <span className="small muted">{records.data.count} record(s)</span>
                <Button disabled={page <= 1} onClick={() => setFilter("page", String(page - 1))}>Previous</Button>
                <span className="small">Page {page} of {totalPages}</span>
                <Button disabled={page >= totalPages} onClick={() => { const n = new URLSearchParams(params); n.set("page", String(page + 1)); setParams(n); }}>Next</Button>
              </div>
            </>
          )}
      </Card>
    </>
  );
}

export function RecordDetailPage() {
  const { id } = useParams();
  const record = useLoad(() => api<RecordItem>(`/records/${id}/`), [id]);
  if (record.loading) return <Loading />;
  if (record.error) return <ErrorState message={record.error} status={record.status === 404 ? 403 : record.status} onRetry={record.reload} />;
  const r = record.data!;
  return (
    <>
      <PageHeader title={`${r.category_name} ${r.source_id}`} subtitle={r.title} actions={<Link to="/records" className="btn btn-ghost">← Back to records</Link>} />
      {r.issues.length > 0 && <Callout tone="warning" title="Data issues (needs admin review)"><ul>{r.issues.map((i, n) => <li key={n}>{i.message}</li>)}</ul></Callout>}
      <div className="grid-2">
        <Card title="Details">
          <KeyValue items={[["Unit", r.unit_name], ["Department", r.department_name], ["Status", r.status || "—"], ["Last synced", fmtDate(r.last_synced_at)],
            ...Object.entries(r.data).map(([k, v]) => [k.replace(/_/g, " "), String(v ?? "—")] as [string, string])]} />
        </Card>
        <div className="stack">
          {r.parent_summary && (
            <Card title="Parent record">
              <p>{r.parent_summary.category}{" "}
                {r.parent_summary.id ? <Link to={`/records/${r.parent_summary.id}`}>{r.parent_summary.source_id}</Link> : <strong>{r.parent_summary.source_id}</strong>} — {r.parent_summary.title}</p>
              <p className="small muted">Status: {r.parent_summary.status}</p>
            </Card>
          )}
          <Card title="Related child items in your scope">
            {!r.children?.length ? <EmptyState title="No child items visible to you." /> : (
              <ul className="plain">{r.children.map((c) => <li key={c.id}><Link to={`/records/${c.id}`}>{c.source_id}</Link> {c.title} <span className="muted small">({c.department}, {c.status})</span></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
