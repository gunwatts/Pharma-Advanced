import { useEffect, useState } from "react";
import { api, ApiError, listAll, type FieldErrors } from "../api/client";
import { loadCategories, loadUnits, toOptions } from "../api/lookups";
import type { DataSource, SheetPreview, SourceMapping, SyncRun, ValidationReport } from "../api/types";
import { useFeedback } from "../components/feedback";
import { Badge, Button, Callout, Card, ChipsInput, EmptyState, ErrorState, Field, Loading, Modal, Select, StateBadge, TextInput } from "../components/ui";
import { fmtDate } from "../lib/format";
import { useLoad } from "../hooks/useLoad";

type Draft = Partial<SourceMapping>;

const EMPTY: Draft = { name: "", worksheet: "", header_row: 1, id_column: "", unit_column: "", fixed_unit: null, department_column: "", status_column: "",
  column_map: {}, date_formats: ["%d-%m-%Y"], max_rejected_rows: 0, active: true };

export function ValidationResult({ report }: { report: ValidationReport }) {
  return (
    <div className="stack">
      <Callout tone={report.ok ? "good" : "critical"} title={report.ok ? "Validation passed" : "Validation found problems"}>
        {report.rows_read} data rows read · {report.rows_open ?? 0} open · {report.rows_closed ?? 0} closed (not stored) · {report.rows_rejected ?? 0} rejected
        (allowed: {report.rejected_threshold ?? 0}) · {report.rows_flagged ?? 0} flagged for review
      </Callout>
      {report.structure_errors.length > 0 && <Callout tone="critical" title="Structure errors"><ul>{report.structure_errors.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
      {report.warnings.length > 0 && <Callout tone="warning" title="Warnings"><ul>{report.warnings.map((e) => <li key={e}>{e}</li>)}</ul></Callout>}
      {!!report.unmapped_columns?.length && <div className="small muted">Unmapped columns (not imported): {report.unmapped_columns.join(", ")}</div>}
      {!!report.issue_counts && Object.keys(report.issue_counts).length > 0 && (
        <div className="small">Issues: {Object.entries(report.issue_counts).map(([k, v]) => <Badge key={k} tone="warning">{k.replace(/_/g, " ")}: {v}</Badge>)}</div>
      )}
      {!!report.rejected?.length && (
        <details open>
          <summary>Rejected rows ({report.rows_rejected})</summary>
          <table className="table compact"><thead><tr><th>Row</th><th>ID</th><th>Reason</th></tr></thead>
            <tbody>{report.rejected.map((r, i) => <tr key={i}><td>{r.row}</td><td>{r.source_id || "—"}</td><td>{r.message}</td></tr>)}</tbody></table>
        </details>
      )}
      {!!report.flagged?.length && (
        <details>
          <summary>Rows flagged for review ({report.rows_flagged})</summary>
          <table className="table compact"><thead><tr><th>Row</th><th>ID</th><th>Issues</th></tr></thead>
            <tbody>{report.flagged.map((r, i) => <tr key={i}><td>{r.row}</td><td>{r.source_id}</td><td>{r.issues.map((x) => x.message).join("; ")}</td></tr>)}</tbody></table>
        </details>
      )}
      {!!report.sample?.length && (
        <details>
          <summary>Sample of normalised rows</summary>
          <div className="table-wrap"><table className="table compact"><thead><tr><th>ID</th><th>Unit</th><th>Department</th><th>Status</th><th>Data</th></tr></thead>
            <tbody>{report.sample.map((r) => <tr key={r.source_id}><td>{r.source_id}</td><td>{r.unit}</td><td>{r.department}</td><td>{r.status}{r.closed && " (closed)"}</td>
              <td className="small">{Object.entries(r.data).map(([k, v]) => `${k}: ${v ?? "—"}`).join(" · ")}</td></tr>)}</tbody></table></div>
        </details>
      )}
    </div>
  );
}

function MappingEditor({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const sources = useLoad(() => listAll<DataSource>("/sources/"), []);
  const categories = useLoad(loadCategories, []);
  const units = useLoad(loadUnits, []);
  const [draft, setDraft] = useState<Draft>(initial);
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { toast, fail, withImpacts } = useFeedback();
  const set = (patch: Draft) => {
    setDraft({ ...draft, ...patch });
    setReport(null);
  };
  const category = categories.data?.find((c) => c.id === draft.category);

  useEffect(() => {
    if (!draft.data_source) return;
    let cancelled = false;
    setPreviewError(null);
    api<SheetPreview>(`/sources/${draft.data_source}/preview/`, { query: { worksheet: draft.worksheet ?? "", header_row: draft.header_row ?? 1 } })
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        if (!draft.worksheet) setDraft((d) => ({ ...d, worksheet: p.worksheet }));
      })
      .catch((err) => {
        if (cancelled) return;
        setPreview(null);
        setPreviewError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.data_source, draft.worksheet, draft.header_row]);

  const headerOptions = (preview?.headers ?? []).map((h) => ({ value: h, label: h }));
  const columnSelect = (label: string, key: keyof SourceMapping, required = false, help?: string) => (
    <Field label={label} required={required} error={errors[key as string]} help={help}>
      {(id) => <Select id={id} value={(draft[key] as string) ?? ""} placeholder={required ? "Select column…" : "— Not mapped —"} options={headerOptions} onChange={(v) => set({ [key]: v } as Draft)} />}
    </Field>
  );

  const validate = async () => {
    setBusy("validate");
    setErrors({});
    try {
      setReport(await api<ValidationReport>("/mappings/validate-draft/", { method: "POST", body: draft }));
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    setErrors({});
    try {
      const done = await withImpacts(async (c) => {
        const saved = initial.id
          ? await api<SourceMapping>(`/mappings/${initial.id}/`, { method: "PATCH", body: draft, query: c ? { confirm: "true" } : undefined })
          : await api<SourceMapping>("/mappings/", { method: "POST", body: draft });
        const r = await api<ValidationReport>(`/mappings/${saved.id}/validate/`, { method: "POST" });
        toast(r.ok ? "Mapping saved and validated." : "Mapping saved, but validation found problems.", r.ok ? "success" : "error");
        return true;
      }, "Change mapping?");
      if (done) onDone();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  if (sources.loading || categories.loading) return <Loading />;
  return (
    <div className="stack">
      <div className="form-grid">
        <Field label="Data source" required error={errors.data_source}>
          {(id) => <Select id={id} value={draft.data_source} placeholder="Select source…" options={toOptions(sources.data)} onChange={(v) => set({ data_source: Number(v), worksheet: "" })} />}
        </Field>
        <Field label="Record category" required error={errors.category}>
          {(id) => <Select id={id} value={draft.category} placeholder="Select category…" options={toOptions(categories.data?.filter((c) => c.active))} onChange={(v) => set({ category: Number(v), column_map: {} })} />}
        </Field>
        <Field label="Worksheet" required error={errors.worksheet}>
          {(id) => <Select id={id} value={draft.worksheet} placeholder="Select worksheet…" options={(preview?.sheets ?? []).map((s) => ({ value: s, label: s }))} onChange={(v) => set({ worksheet: v })} />}
        </Field>
        <Field label="Header row number" error={errors.header_row}>{(id) => <TextInput id={id} type="number" min={1} value={draft.header_row} onChange={(v) => set({ header_row: Number(v) || 1 })} />}</Field>
        <Field label="Mapping name (optional)">{(id) => <TextInput id={id} value={draft.name} onChange={(v) => set({ name: v })} />}</Field>
      </div>
      {previewError && <Callout tone="critical" title="Cannot read the worksheet">{previewError}</Callout>}
      {preview && (
        <details>
          <summary>Preview: {preview.headers.length} columns, {preview.row_count} data rows in “{preview.worksheet}”</summary>
          <div className="table-wrap"><table className="table compact"><thead><tr><th>Row</th>{preview.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{preview.rows.map((r) => <tr key={r.row}><td>{r.row}</td>{preview.headers.map((h) => <td key={h}>{r.values[h]}</td>)}</tr>)}</tbody></table></div>
        </details>
      )}
      {preview && category && (
        <>
          <h4>Key columns</h4>
          <div className="form-grid">
            {columnSelect("Unique record ID", "id_column", true, "Must be unique and stable, e.g. the CC/CAPA number.")}
            {columnSelect("Department", "department_column", true)}
            <Field label="Fixed unit (optional)" help="Set when this worksheet only contains one unit. A failed sync then holds only that unit's emails.">
              {(id) => <Select id={id} value={draft.fixed_unit ?? ""} placeholder="— Unit comes from a column —" options={toOptions(units.data)} onChange={(v) => set({ fixed_unit: v ? Number(v) : null })} />}
            </Field>
            {!draft.fixed_unit && columnSelect("Unit", "unit_column", true)}
            {columnSelect("Status", "status_column", false, "Closed statuses are not stored and are removed after a successful sync.")}
          </div>
          <h4>Fields of {category.name}</h4>
          <div className="form-grid">
            {category.fields_detail.filter((f) => f.active).map((f) => (
              <Field key={f.key} label={`${f.label}${f.field_type === "date" ? " (date)" : ""}`} required={f.required}>
                {(id) => <Select id={id} value={draft.column_map?.[f.key] ?? ""} placeholder={f.required ? "Select column…" : "— Not mapped —"} options={headerOptions}
                  onChange={(v) => { const map = { ...(draft.column_map ?? {}) }; if (v) map[f.key] = v; else delete map[f.key]; set({ column_map: map }); }} />}
              </Field>
            ))}
          </div>
          {errors.column_map && <div className="error-text">{errors.column_map.join(" ")}</div>}
          <div className="form-grid">
            <Field label="Date formats used in text cells" help="Tried in order, e.g. %d-%m-%Y = 24-10-2026, %d-%b-%Y = 24-Oct-2026. Real Excel dates are read automatically." error={errors.date_formats}>
              {(id) => <ChipsInput id={id} value={draft.date_formats ?? []} onChange={(v) => set({ date_formats: v })} placeholder="%d-%m-%Y" />}
            </Field>
            <Field label="Allowed rejected rows" help="If more rows than this are rejected (unknown unit, duplicate ID…), the sync is marked incomplete and NOTHING is changed." error={errors.max_rejected_rows}>
              {(id) => <TextInput id={id} type="number" min={0} value={draft.max_rejected_rows} onChange={(v) => set({ max_rejected_rows: Number(v) || 0 })} />}
            </Field>
          </div>
        </>
      )}
      {report && <ValidationResult report={report} />}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button busy={busy === "validate"} disabled={!preview || !category} onClick={() => void validate()}>Validate sample</Button>
        <Button variant="primary" busy={busy === "save"} disabled={!preview || !category} onClick={() => void save()}>Save mapping</Button>
      </div>
    </div>
  );
}

export function MappingPanel({ onChange }: { onChange?: () => void }) {
  const mappings = useLoad(() => listAll<SourceMapping>("/mappings/"), []);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState<SyncRun | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const { toast, fail, withImpacts } = useFeedback();
  const refresh = () => {
    void mappings.reload();
    onChange?.();
  };
  const act = async (m: SourceMapping, action: "validate" | "sync") => {
    setBusyId(m.id);
    try {
      if (action === "validate") setReport(await api<ValidationReport>(`/mappings/${m.id}/validate/`, { method: "POST" }));
      else {
        const run = await api<SyncRun>(`/mappings/${m.id}/sync/`, { method: "POST" });
        setLastRun(run);
        toast(`Sync ${run.status}: ${run.message}`, run.status === "success" ? "success" : "error");
      }
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusyId(null);
    }
  };
  const remove = async (m: SourceMapping) => {
    try {
      const done = await withImpacts(async (c) => {
        await api(`/mappings/${m.id}/`, { method: "DELETE", query: c ? { confirm: "true" } : undefined });
        return true;
      }, "Delete mapping?");
      if (done) refresh();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <Card title="Excel mappings" actions={<Button variant="primary" onClick={() => setEditing({ ...EMPTY })}>Add mapping</Button>}>
      <p className="muted">Each mapping links one worksheet to one record category. Only mapped columns of open records are stored.</p>
      {mappings.loading && !mappings.data ? <Loading /> : mappings.error ? <ErrorState message={mappings.error} status={mappings.status} onRetry={mappings.reload} /> :
        !mappings.data?.length ? <EmptyState title="No mappings yet">Add a mapping for each worksheet you want to track.</EmptyState> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Category</th><th>Source / worksheet</th><th>Validated</th><th>Last sync</th><th>Rows</th><th /></tr></thead>
              <tbody>
                {mappings.data.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Category">{m.category_name}{m.fixed_unit_name && <div className="small muted">unit: {m.fixed_unit_name}</div>}{!m.active && <Badge>inactive</Badge>}</td>
                    <td data-label="Source">{m.data_source_name} / {m.worksheet}</td>
                    <td data-label="Validated">{m.last_validation_ok == null ? <Badge>not validated</Badge> : <Badge tone={m.last_validation_ok ? "good" : "critical"}>{m.last_validation_ok ? "passed" : "problems"}</Badge>}</td>
                    <td data-label="Last sync"><StateBadge state={m.last_status || null} /> <div className="small muted">{fmtDate(m.last_attempt_at)}</div>{m.last_error && <div className="small error-text">{m.last_error}</div>}</td>
                    <td data-label="Rows" className="small">{m.last_rows_imported ?? 0} imported / {m.last_rows_rejected ?? 0} rejected</td>
                    <td className="row-actions">
                      <Button busy={busyId === m.id} onClick={() => void act(m, "validate")}>Validate</Button>
                      <Button busy={busyId === m.id} onClick={() => void act(m, "sync")}>Sync now</Button>
                      <Button variant="ghost" onClick={() => setEditing(m)}>Edit</Button>
                      <Button variant="ghost" className="danger-text" onClick={() => void remove(m)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {lastRun && <Callout tone={lastRun.status === "success" ? "good" : "warning"} title={`Last manual sync: ${lastRun.mapping_name}`}>{lastRun.message}</Callout>}
      {report && <Modal title="Validation report" onClose={() => setReport(null)}><ValidationResult report={report} /></Modal>}
      {editing && (
        <Modal title={editing.id ? "Edit Excel mapping" : "Add Excel mapping"} onClose={() => setEditing(null)} width={960}>
          <MappingEditor initial={editing} onDone={() => { setEditing(null); refresh(); }} />
        </Modal>
      )}
    </Card>
  );
}
