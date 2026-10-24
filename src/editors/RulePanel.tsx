import { useState } from "react";
import { api, ApiError, listAll, type FieldErrors } from "../api/client";
import { fieldOptions, loadCategories, loadDepartments, loadUnits, toOptions } from "../api/lookups";
import type { Condition, ReminderRule } from "../api/types";
import { useFeedback } from "../components/feedback";
import { Badge, Button, Callout, Card, Checkbox, EmptyState, ErrorState, Field, Loading, Modal, MultiSelect, Select, TextInput } from "../components/ui";
import { useLoad } from "../hooks/useLoad";

type Draft = Partial<ReminderRule>;
const NO_VALUE_OPS = new Set(["is_empty", "not_empty"]);

function RuleEditor({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const categories = useLoad(loadCategories, []);
  const units = useLoad(loadUnits, []);
  const departments = useLoad(loadDepartments, []);
  const operators = useLoad(() => api<{ key: string; label: string }[]>("/rules/operators/"), []);
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const { toast, fail } = useFeedback();
  const category = categories.data?.find((c) => c.id === draft.category);
  const statusOptions = (category?.statuses_detail ?? []).filter((s) => !s.is_closed).map((s) => ({ value: s.value, label: s.label || s.value }));
  const conditions = draft.conditions ?? [];
  const setCond = (i: number, patch: Partial<Condition>) => setDraft({ ...draft, conditions: conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      if (initial.id) await api(`/rules/${initial.id}/`, { method: "PATCH", body: draft });
      else await api("/rules/", { method: "POST", body: draft });
      toast("Rule saved. Run a dry run to check the effect.");
      onDone();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  if (categories.loading) return <Loading />;
  const window = draft.window_days ?? 7;
  return (
    <div className="stack">
      <div className="form-grid">
        <Field label="Rule name" required error={errors.name}>{(id) => <TextInput id={id} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />}</Field>
        <Field label="Category" required error={errors.category}>
          {(id) => <Select id={id} value={draft.category} placeholder="Select…" options={toOptions(categories.data?.filter((c) => c.active))}
            onChange={(v) => setDraft({ ...draft, category: Number(v), target_date_field: "", include_statuses: [], exclude_statuses: [], conditions: [] })} />}
        </Field>
        <Field label="Target date field" required error={errors.target_date_field}>
          {(id) => <Select id={id} value={draft.target_date_field} placeholder="Select date field…" options={fieldOptions(category, { onlyType: "date" })} onChange={(v) => setDraft({ ...draft, target_date_field: v })} />}
        </Field>
        <Field label="Reminder window (days ahead)" error={errors.window_days} help="Default 7.">
          {(id) => <TextInput id={id} type="number" min={0} max={365} value={draft.window_days} onChange={(v) => setDraft({ ...draft, window_days: Math.max(0, Number(v) || 0) })} />}
        </Field>
      </div>
      <Callout tone="info" title="Which dates are emailed">
        Records due <strong>today</strong> up to <strong>{window} day(s) ahead</strong> are included. Records with a target date <strong>before today are never emailed</strong> — they stay on dashboards for offline follow-up. Missing/invalid dates are flagged for admin review.
      </Callout>
      <div className="form-grid">
        <Field label="Only these statuses (empty = all open statuses)" error={errors.include_statuses}>
          {() => <MultiSelect value={draft.include_statuses ?? []} options={statusOptions} onChange={(v) => setDraft({ ...draft, include_statuses: v as string[] })} emptyLabel="all open statuses" />}
        </Field>
        <Field label="Exclude statuses" error={errors.exclude_statuses}>
          {() => <MultiSelect value={draft.exclude_statuses ?? []} options={statusOptions} onChange={(v) => setDraft({ ...draft, exclude_statuses: v as string[] })} emptyLabel="none" />}
        </Field>
        <Field label="Units (empty = all)">{() => <MultiSelect value={draft.units ?? []} options={toOptions(units.data)} onChange={(v) => setDraft({ ...draft, units: v as number[] })} />}</Field>
        <Field label="Departments (empty = all)">{() => <MultiSelect value={draft.departments ?? []} options={toOptions(departments.data)} onChange={(v) => setDraft({ ...draft, departments: v as number[] })} />}</Field>
      </div>
      <h4>Exclusions — skip a record when…</h4>
      {conditions.length === 0 && <p className="muted small">No exclusion conditions.</p>}
      {conditions.map((c, i) => (
        <div className="condition-row" key={i}>
          <Select value={c.field} placeholder="Field…" options={fieldOptions(category, { system: true })} onChange={(v) => setCond(i, { field: v })} />
          <Select value={c.op} placeholder="Operator…" options={(operators.data ?? []).map((o) => ({ value: o.key, label: o.label }))} onChange={(v) => setCond(i, { op: v })} />
          {!NO_VALUE_OPS.has(c.op) && <TextInput value={c.value ?? ""} onChange={(v) => setCond(i, { value: v })} placeholder={c.op?.endsWith("in") ? "comma, separated" : "value"} />}
          <Button variant="ghost" aria-label="Remove condition" onClick={() => setDraft({ ...draft, conditions: conditions.filter((_, j) => j !== i) })}>Remove</Button>
        </div>
      ))}
      {errors.conditions && <div className="error-text">{errors.conditions.join(" ")}</div>}
      <div><Button onClick={() => setDraft({ ...draft, conditions: [...conditions, { field: "", op: "equals", value: "" }] })} disabled={!category}>Add exclusion</Button></div>
      <Checkbox checked={draft.active ?? true} onChange={(v) => setDraft({ ...draft, active: v })} label="Active" />
      <div className="modal-actions">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" busy={busy} onClick={() => void save()}>Save rule</Button>
      </div>
    </div>
  );
}

export function RulePanel({ onChange }: { onChange?: () => void }) {
  const rules = useLoad(() => listAll<ReminderRule>("/rules/"), []);
  const [editing, setEditing] = useState<Draft | null>(null);
  const { fail, confirm } = useFeedback();
  const refresh = () => {
    void rules.reload();
    onChange?.();
  };
  const remove = async (r: ReminderRule) => {
    if (!(await confirm({ title: `Delete rule "${r.name}"?`, message: "Records of this category will no longer be reminded unless another rule covers them.", danger: true, confirmLabel: "Delete" }))) return;
    try {
      await api(`/rules/${r.id}/`, { method: "DELETE" });
      refresh();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <Card title="Reminder rules" actions={<Button variant="primary" onClick={() => setEditing({ name: "", window_days: 7, include_statuses: [], exclude_statuses: [], conditions: [], units: [], departments: [], active: true })}>Add rule</Button>}>
      {rules.loading && !rules.data ? <Loading /> : rules.error ? <ErrorState message={rules.error} status={rules.status} onRetry={rules.reload} /> :
        !rules.data?.length ? <EmptyState title="No reminder rules">Add a rule per category you want reminders for.</EmptyState> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Rule</th><th>Category</th><th>Target date</th><th>Window</th><th>Filters</th><th /></tr></thead>
            <tbody>
              {rules.data.map((r) => (
                <tr key={r.id}>
                  <td data-label="Rule">{r.name} {!r.active && <Badge>inactive</Badge>}</td>
                  <td data-label="Category">{r.category_name}</td>
                  <td data-label="Target date">{r.target_date_field}</td>
                  <td data-label="Window">today … +{r.window_days} days</td>
                  <td data-label="Filters" className="small">
                    {r.include_statuses.length > 0 && <div>Only: {r.include_statuses.join(", ")}</div>}
                    {r.exclude_statuses.length > 0 && <div>Not: {r.exclude_statuses.join(", ")}</div>}
                    {r.conditions.length > 0 && <div>{r.conditions.length} exclusion(s)</div>}
                    {r.units.length + r.departments.length > 0 && <div>Scoped to selected units/departments</div>}
                  </td>
                  <td className="row-actions">
                    <Button variant="ghost" onClick={() => setEditing(r)}>Edit</Button>
                    <Button variant="ghost" className="danger-text" onClick={() => void remove(r)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      {editing && <Modal title={editing.id ? "Edit reminder rule" : "Add reminder rule"} onClose={() => setEditing(null)} width={900}><RuleEditor initial={editing} onDone={() => { setEditing(null); refresh(); }} /></Modal>}
    </Card>
  );
}
