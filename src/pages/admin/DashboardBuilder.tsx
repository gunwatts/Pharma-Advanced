import { useState } from "react";
import { api, ApiError, listAll, type FieldErrors } from "../../api/client";
import { fieldOptions, loadCategories, toOptions } from "../../api/lookups";
import type { Condition, Dashboard, Role, User, Widget, WidgetResult, WidgetType } from "../../api/types";
import { useFeedback } from "../../components/feedback";
import { WidgetView } from "../../components/WidgetView";
import { Badge, Button, Card, ChipsInput, EmptyState, ErrorState, Field, Loading, Modal, Select, TextInput } from "../../components/ui";
import { useLoad } from "../../hooks/useLoad";

const TYPES: { value: WidgetType; label: string }[] = [
  { value: "kpi", label: "KPI card (count)" }, { value: "donut", label: "Donut chart" }, { value: "pie", label: "Pie chart" }, { value: "bar", label: "Bar chart" },
  { value: "line", label: "Line chart (over time)" }, { value: "area", label: "Area chart (over time)" }, { value: "table", label: "Table" },
  { value: "upcoming", label: "Upcoming deadlines" }, { value: "overdue", label: "Overdue list (offline follow-up)" },
];
const GROUPABLE = new Set(["pie", "donut", "bar"]);
const DATED = new Set(["line", "area", "upcoming", "overdue"]);
const LISTS = new Set(["table", "upcoming", "overdue"]);

function WidgetEditor({ initial, onDone }: { initial: Partial<Widget>; onDone: () => void }) {
  const categories = useLoad(loadCategories, []);
  const operators = useLoad(() => api<{ key: string; label: string }[]>("/rules/operators/"), []);
  const [draft, setDraft] = useState<Partial<Widget>>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [preview, setPreview] = useState<WidgetResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast, fail } = useFeedback();
  const category = categories.data?.find((c) => c.id === draft.category);
  const t = draft.widget_type ?? "kpi";
  const groupOptions = [{ value: "category", label: "Category" }, { value: "has_issues", label: "Has data issues" }, ...fieldOptions(category, { system: true }).filter((o) => o.value !== "source_id")];
  const filters = draft.filters ?? [];
  const setFilter = (i: number, patch: Partial<Condition>) => setDraft({ ...draft, filters: filters.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const dateFields = category ? fieldOptions(category, { onlyType: "date" }) : [{ value: "target_date", label: "Target date (target_date)" }];

  const runPreview = async () => {
    setBusy("preview");
    setErrors({});
    try {
      const r = await api<{ ok: boolean; data: WidgetResult["data"] }>("/widgets/preview/", { method: "POST", body: draft });
      setPreview({ id: 0, ok: r.ok, data: r.data });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      setPreview({ id: 0, ok: false, error: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    setBusy("save");
    setErrors({});
    try {
      if (initial.id) await api(`/widgets/${initial.id}/`, { method: "PATCH", body: draft });
      else await api("/widgets/", { method: "POST", body: draft });
      toast("Widget saved.");
      onDone();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  if (categories.loading) return <Loading />;
  return (
    <div className="stack">
      <div className="form-grid">
        <Field label="Title" required error={errors.title}>{(id) => <TextInput id={id} value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />}</Field>
        <Field label="Widget type" required error={errors.widget_type}>{(id) => <Select id={id} value={t} options={TYPES} onChange={(v) => setDraft({ ...draft, widget_type: v as WidgetType })} />}</Field>
        <Field label="Category / source" help="Empty = all categories.">{(id) => <Select id={id} value={draft.category ?? ""} placeholder="All categories" options={toOptions(categories.data)} onChange={(v) => setDraft({ ...draft, category: v ? Number(v) : null })} />}</Field>
        {GROUPABLE.has(t) && <Field label="Group by" error={errors.group_by}>{(id) => <Select id={id} value={draft.group_by} options={groupOptions} onChange={(v) => setDraft({ ...draft, group_by: v })} />}</Field>}
        {DATED.has(t) && <Field label="Date field" required error={errors.date_field}>{(id) => <Select id={id} value={draft.date_field} placeholder="Select…" options={dateFields} onChange={(v) => setDraft({ ...draft, date_field: v })} />}</Field>}
        {(t === "line" || t === "area") && <Field label="Bucket">{(id) => <Select id={id} value={draft.date_bucket} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} onChange={(v) => setDraft({ ...draft, date_bucket: v as Widget["date_bucket"] })} />}</Field>}
        {t === "upcoming" && <Field label="Days ahead">{(id) => <TextInput id={id} type="number" value={draft.window_days} onChange={(v) => setDraft({ ...draft, window_days: Number(v) })} />}</Field>}
        {(LISTS.has(t) || GROUPABLE.has(t)) && <Field label="Max rows / segments" error={errors.limit}>{(id) => <TextInput id={id} type="number" value={draft.limit} onChange={(v) => setDraft({ ...draft, limit: Number(v) })} />}</Field>}
        {t === "table" && <Field label="Sort by">{(id) => <Select id={id} value={draft.sort_by} placeholder="— Default —" options={fieldOptions(category, { system: true })} onChange={(v) => setDraft({ ...draft, sort_by: v })} />}</Field>}
        <Field label="Width (grid columns)">{(id) => <Select id={id} value={draft.width} options={[1, 2, 3].map((n) => ({ value: n, label: `${n}` }))} onChange={(v) => setDraft({ ...draft, width: Number(v) })} />}</Field>
        <Field label="Position">{(id) => <TextInput id={id} type="number" value={draft.position} onChange={(v) => setDraft({ ...draft, position: Number(v) })} />}</Field>
      </div>
      {LISTS.has(t) && <Field label="Extra columns (field keys)">{(id) => <ChipsInput id={id} value={draft.columns ?? []} onChange={(v) => setDraft({ ...draft, columns: v })} placeholder="owner" />}</Field>}
      <h4>Filters</h4>
      {filters.map((f, i) => (
        <div className="condition-row" key={i}>
          <Select value={f.field} placeholder="Field…" options={[{ value: "category", label: "Category" }, ...fieldOptions(category, { system: true })]} onChange={(v) => setFilter(i, { field: v })} />
          <Select value={f.op} options={(operators.data ?? []).map((o) => ({ value: o.key, label: o.label }))} onChange={(v) => setFilter(i, { op: v })} />
          {!["is_empty", "not_empty"].includes(f.op) && <TextInput value={f.value ?? ""} onChange={(v) => setFilter(i, { value: v })} />}
          <Button variant="ghost" onClick={() => setDraft({ ...draft, filters: filters.filter((_, j) => j !== i) })}>Remove</Button>
        </div>
      ))}
      {errors.filters && <div className="error-text">{errors.filters.join(" ")}</div>}
      <div><Button onClick={() => setDraft({ ...draft, filters: [...filters, { field: "status", op: "equals", value: "" }] })}>Add filter</Button></div>
      {preview && (
        <Card title={`Preview (your own data scope): ${draft.title || "untitled"}`}>
          <WidgetView widget={{ ...(draft as Widget), id: draft.id ?? 0 }} result={preview} />
        </Card>
      )}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button busy={busy === "preview"} onClick={() => void runPreview()}>Preview</Button>
        <Button variant="primary" busy={busy === "save"} onClick={() => void save()}>Save widget</Button>
      </div>
    </div>
  );
}

function Assignments({ dashboard, onChange }: { dashboard: Dashboard; onChange: () => void }) {
  const roles = useLoad(() => listAll<Role>("/roles/").catch((): Role[] => []), []);
  const users = useLoad(() => listAll<User>("/users/").catch((): User[] => []), []);
  const [role, setRole] = useState("");
  const [user, setUser] = useState("");
  const { fail } = useFeedback();
  const add = async (body: { role?: number; user?: number }) => {
    try {
      await api("/dashboard-assignments/", { method: "POST", body: { dashboard: dashboard.id, ...body } });
      setRole("");
      setUser("");
      onChange();
    } catch (err) {
      fail(err);
    }
  };
  const remove = async (id: number) => {
    try {
      await api(`/dashboard-assignments/${id}/`, { method: "DELETE" });
      onChange();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <div className="stack">
      <div className="chip-row">
        {dashboard.assignments.length === 0 && <span className="muted small">Not assigned — only dashboard managers can see it.</span>}
        {dashboard.assignments.map((a) => (
          <span className="chip chip-on" key={a.id}>{a.role_name ? `Role: ${a.role_name}` : `User: ${a.username}`}<button type="button" aria-label="Remove assignment" onClick={() => void remove(a.id)}>×</button></span>
        ))}
      </div>
      <div className="inline wrap">
        <Select value={role} onChange={setRole} placeholder="Assign to role…" options={toOptions(roles.data)} />
        <Button disabled={!role} onClick={() => void add({ role: Number(role) })}>Assign role</Button>
        <Select value={user} onChange={setUser} placeholder="Assign to user…" options={(users.data ?? []).map((u) => ({ value: u.id, label: u.username }))} />
        <Button disabled={!user} onClick={() => void add({ user: Number(user) })}>Assign user</Button>
      </div>
    </div>
  );
}

export function DashboardBuilder() {
  const dashboards = useLoad(() => listAll<Dashboard>("/dashboards/"), []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [widget, setWidget] = useState<Partial<Widget> | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const { toast, fail, confirm } = useFeedback();
  const selected = dashboards.data?.find((d) => d.id === selectedId) ?? null;
  const reload = () => void dashboards.reload();

  const create = async () => {
    try {
      const d = await api<Dashboard>("/dashboards/", { method: "POST", body: { name, description: "" } });
      setCreating(false);
      setName("");
      await dashboards.reload();
      setSelectedId(d.id);
    } catch (err) {
      fail(err);
    }
  };
  const action = async (path: string, body?: unknown, message?: string) => {
    try {
      const d = await api<Dashboard>(path, { method: "POST", body });
      if (message) toast(message);
      await dashboards.reload();
      if (path.endsWith("clone/")) setSelectedId(d.id);
    } catch (err) {
      fail(err);
    }
  };
  const removeDashboard = async (d: Dashboard) => {
    if (!(await confirm({ title: `Delete dashboard "${d.name}"?`, message: "Its widgets and assignments are deleted. Users assigned to it lose access.", danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api(`/dashboards/${d.id}/`, { method: "DELETE" });
      setSelectedId(null);
      reload();
    } catch (err) {
      fail(err);
    }
  };
  const removeWidget = async (w: Widget) => {
    if (!(await confirm({ title: `Remove widget "${w.title}"?`, danger: true, confirmLabel: "Remove" }))) return;
    try {
      await api(`/widgets/${w.id}/`, { method: "DELETE" });
      reload();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className="stack">
      <Card title="Dashboards" actions={<Button variant="primary" onClick={() => setCreating(true)}>New dashboard</Button>}>
        {dashboards.loading && !dashboards.data ? <Loading /> : dashboards.error ? <ErrorState message={dashboards.error} status={dashboards.status} /> :
          !dashboards.data?.length ? <EmptyState title="No dashboards yet." /> : (
            <div className="chip-row">
              {dashboards.data.map((d) => (
                <button type="button" key={d.id} className={`chip ${d.id === selectedId ? "chip-on" : ""}`} onClick={() => setSelectedId(d.id)}>
                  {d.name} {d.is_published ? "· published" : "· draft"}
                </button>
              ))}
            </div>
          )}
      </Card>
      {selected && (
        <Card title={selected.name} actions={
          <>
            {selected.is_published ? <Badge tone="good">published</Badge> : <Badge tone="warning">draft</Badge>}
            <Button onClick={() => void action(`/dashboards/${selected.id}/publish/`, { published: !selected.is_published }, selected.is_published ? "Unpublished." : "Published.")}>{selected.is_published ? "Unpublish" : "Publish"}</Button>
            <Button onClick={() => void action(`/dashboards/${selected.id}/clone/`, undefined, "Cloned.")}>Clone</Button>
            <a className="btn btn-ghost" href={`#/dashboards/${selected.id}`}>Open</a>
            <Button variant="ghost" className="danger-text" onClick={() => void removeDashboard(selected)}>Delete</Button>
          </>
        }>
          <h4>Assigned to</h4>
          <Assignments dashboard={selected} onChange={reload} />
          <h4>Widgets</h4>
          {selected.widgets.length === 0 && <p className="muted">No widgets yet.</p>}
          <div className="stack">
            {selected.widgets.map((w) => (
              <div className="item-row" key={w.id}>
                <div className="item-main"><div className="item-title">{w.title}</div><div className="small muted">{TYPES.find((x) => x.value === w.widget_type)?.label} · width {w.width} · position {w.position}</div></div>
                <div className="row-actions"><Button variant="ghost" onClick={() => setWidget(w)}>Edit</Button><Button variant="ghost" className="danger-text" onClick={() => void removeWidget(w)}>Remove</Button></div>
              </div>
            ))}
          </div>
          <div><Button variant="primary" onClick={() => setWidget({ dashboard: selected.id, title: "", widget_type: "kpi", category: null, filters: [], group_by: "status", date_field: "target_date", date_bucket: "month", window_days: 7, columns: [], sort_by: "", sort_desc: false, limit: 10, width: 1, position: selected.widgets.length })}>Add widget</Button></div>
        </Card>
      )}
      {creating && (
        <Modal title="New dashboard" onClose={() => setCreating(false)} width={460}>
          <Field label="Name">{(id) => <TextInput id={id} value={name} onChange={setName} />}</Field>
          <div className="modal-actions"><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" disabled={!name} onClick={() => void create()}>Create</Button></div>
        </Modal>
      )}
      {widget && <Modal title={widget.id ? "Edit widget" : "Add widget"} onClose={() => setWidget(null)} width={960}><WidgetEditor initial={widget} onDone={() => { setWidget(null); reload(); }} /></Modal>}
    </div>
  );
}
