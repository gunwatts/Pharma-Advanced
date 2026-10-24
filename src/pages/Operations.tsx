import { useState } from "react";
import { api, type Page } from "../api/client";
import type { AuditEvent, DailyRun, Delivery, SyncRun } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useFeedback } from "../components/feedback";
import { Badge, Button, Callout, Card, Checkbox, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Select, StateBadge, TextArea } from "../components/ui";
import { fmtDate } from "../lib/format";
import { useLoad } from "../hooks/useLoad";

function Pager({ page, count, setPage, size = 50 }: { page: number; count: number; setPage: (p: number) => void; size?: number }) {
  const pages = Math.max(1, Math.ceil(count / size));
  return (
    <div className="pager">
      <span className="small muted">{count} item(s)</span>
      <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
      <span className="small">Page {page} of {pages}</span>
      <Button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
    </div>
  );
}

function RunDetail({ run, onClose }: { run: DailyRun; onClose: () => void }) {
  const s = run.summary;
  return (
    <Modal title={`Run #${run.id} — ${run.kind} ${run.run_date}`} onClose={onClose} width={960}>
      <p><StateBadge state={run.status} /> started {fmtDate(run.started_at)} by {run.triggered_by || "—"} · finished {fmtDate(run.finished_at)}</p>
      {(s.reason || s.error) && <Callout tone={s.error ? "critical" : "warning"}>{s.reason || s.error}</Callout>}
      {!!s.untrusted?.length && <Callout tone="critical" title="Source problems"><ul>{s.untrusted.map((u) => <li key={u}>{u}</li>)}</ul></Callout>}
      {!!s.warnings?.length && <Callout tone="warning" title="Warnings"><ul>{s.warnings.map((u) => <li key={u}>{u}</li>)}</ul></Callout>}
      {!!s.unrouted && <Callout tone="warning">{s.unrouted} record(s) have no recipient group.</Callout>}
      {!!s.sync?.length && (
        <details open><summary>Sync</summary><ul>{s.sync.map((x) => <li key={x.mapping_id}><StateBadge state={x.status} /> {x.mapping}: {x.message}</li>)}</ul></details>
      )}
      {!!s.groups?.length && (
        <div className="table-wrap"><table className="table compact">
          <thead><tr><th>Unit / Department</th><th>Planned</th><th>Outcome</th><th>Items</th><th>Details</th></tr></thead>
          <tbody>{s.groups.map((g) => <tr key={g.group_id}><td>{g.unit} / {g.department}</td><td>{g.planned.replace("_", " ")}</td><td><StateBadge state={g.outcome.replace("skipped_sent", "sent")} />{g.outcome === "skipped_sent" && <span className="small muted"> (already sent earlier)</span>}</td><td>{g.items}</td><td className="small">{[g.detail, ...g.hold_reasons].filter(Boolean).join(" | ")}</td></tr>)}</tbody>
        </table></div>
      )}
      {s.totals && <p className="small">Dry run totals: {s.totals.reminder} reminder, {s.totals.no_pending} no-pending, {s.totals.held} held, {s.totals.included_items} items.</p>}
    </Modal>
  );
}

function ReconcileDialog({ delivery, onClose }: { delivery: Delivery; onClose: (changed: boolean) => void }) {
  const [action, setAction] = useState<"mark_sent" | "authorize_retry">("mark_sent");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast, fail } = useFeedback();
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/deliveries/${delivery.id}/reconcile/`, { method: "POST", body: { action, note } });
      toast("Delivery updated.");
      onClose(true);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Reconcile: ${delivery.unit_name} / ${delivery.department_name}`} onClose={() => onClose(false)} width={560}>
      <Callout tone="warning">Check the sender mailbox's Sent folder (search for "{delivery.subject}") or ask a recipient before deciding. Uncertain deliveries are never resent automatically.</Callout>
      <Field label="Outcome">{(id) => <Select id={id} value={action} onChange={(v) => setAction(v as typeof action)} options={[{ value: "mark_sent", label: "It was delivered — mark as sent" }, { value: "authorize_retry", label: "It was NOT delivered — allow the next run/retry to resend" }]} />}</Field>
      <Field label="How was this verified?" required>{(id) => <TextArea id={id} value={note} onChange={setNote} rows={3} />}</Field>
      <div className="modal-actions"><Button variant="ghost" onClick={() => onClose(false)}>Cancel</Button><Button variant="primary" busy={busy} disabled={!note.trim()} onClick={() => void submit()}>Save</Button></div>
    </Modal>
  );
}

export function RunsPage() {
  const { can } = useAuth();
  const { toast, fail, confirm } = useFeedback();
  const [runPage, setRunPage] = useState(1);
  const [delPage, setDelPage] = useState(1);
  const [stateFilter, setStateFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const runs = useLoad(() => api<Page<DailyRun>>("/runs/", { query: { page: runPage, page_size: 20 } }), [runPage]);
  const deliveries = useLoad(() => api<Page<Delivery>>("/deliveries/", { query: { page: delPage, state: stateFilter, kind: kindFilter } }), [delPage, stateFilter, kindFilter]);
  const [detail, setDetail] = useState<DailyRun | null>(null);
  const [reconcile, setReconcile] = useState<Delivery | null>(null);
  const [runNow, setRunNow] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const today = new Date().toLocaleDateString("en-CA"); // server re-validates against the business date

  const refresh = () => {
    void runs.reload();
    void deliveries.reload();
  };
  const startRun = async () => {
    setBusy("run");
    try {
      const run = await api<DailyRun>("/runs/run-now/", { method: "POST", body: { confirm: true, retry: true } });
      toast(`Run #${run.id}: ${run.status.replace(/_/g, " ")}`, run.status === "completed" ? "success" : "error");
      setRunNow(false);
      setConfirmed(false);
      refresh();
      setDetail(run);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };
  const retry = async (d: Delivery) => {
    if (!(await confirm({ title: `Retry ${d.unit_name} / ${d.department_name}?`, message: "Sources are re-synced and only this unit-department is processed. Groups already sent today are never resent.", confirmLabel: "Retry" }))) return;
    setBusy(`retry-${d.id}`);
    try {
      const res = await api<{ delivery: Delivery }>(`/deliveries/${d.id}/retry/`, { method: "POST", body: { sync: true } });
      toast(`Now: ${res.delivery.state.replace(/_/g, " ")}`, res.delivery.state === "sent" ? "success" : "error");
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Runs & deliveries" subtitle="Daily run history and the delivery ledger (one consolidated email per unit-department per day)."
        actions={can("runs.manage") && <Button variant="primary" onClick={() => setRunNow(true)}>Run / retry today now…</Button>} />
      <Card title="Runs">
        {runs.loading && !runs.data ? <Loading /> : runs.error ? <ErrorState message={runs.error} status={runs.status} onRetry={runs.reload} /> : !runs.data?.results.length ? <EmptyState title="No runs yet." /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>#</th><th>Date</th><th>Kind</th><th>Status</th><th>Summary</th><th>By</th><th /></tr></thead>
              <tbody>{runs.data.results.map((r) => (
                <tr key={r.id}>
                  <td data-label="#">{r.id}</td><td data-label="Date">{r.run_date}</td><td data-label="Kind">{r.kind.replace("_", " ")}</td><td data-label="Status"><StateBadge state={r.status} /></td>
                  <td data-label="Summary" className="small">{r.summary.reason || r.summary.error || (r.summary.totals ? `${r.summary.totals.reminder} reminder · ${r.summary.totals.held} held` : `${r.summary.sent ?? 0} sent · ${r.summary.failed ?? 0} failed · ${r.summary.uncertain ?? 0} uncertain · ${r.summary.held ?? 0} held · ${r.summary.skipped ?? 0} skipped`)}</td>
                  <td data-label="By" className="small">{r.triggered_by}</td>
                  <td><Button variant="ghost" onClick={() => setDetail(r)}>Details</Button></td>
                </tr>
              ))}</tbody>
            </table></div>
            <Pager page={runPage} count={runs.data.count} setPage={setRunPage} size={20} />
          </>
        )}
      </Card>
      <Card title="Delivery ledger" actions={
        <div className="inline">
          <Select value={stateFilter} onChange={(v) => { setStateFilter(v); setDelPage(1); }} placeholder="All states" options={["sent", "failed", "uncertain", "held", "in_progress", "retry_authorized", "pending"].map((s) => ({ value: s, label: s.replace("_", " ") }))} />
          <Select value={kindFilter} onChange={(v) => { setKindFilter(v); setDelPage(1); }} placeholder="All kinds" options={["reminder", "no_pending", "test", "alert"].map((s) => ({ value: s, label: s.replace("_", " ") }))} />
        </div>
      }>
        <p className="small muted">“Sent” means accepted by the email provider. The log-only (console) provider never delivers email; such rows show provider “console”.</p>
        {deliveries.loading && !deliveries.data ? <Loading /> : deliveries.error ? <ErrorState message={deliveries.error} status={deliveries.status} onRetry={deliveries.reload} /> : !deliveries.data?.results.length ? <EmptyState title="No deliveries match." /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Date</th><th>Unit / Department</th><th>Kind</th><th>State</th><th>Recipients</th><th>Items</th><th>Provider</th><th>Attempts</th><th /></tr></thead>
              <tbody>{deliveries.data.results.map((d) => (
                <tr key={d.id}>
                  <td data-label="Date">{d.run_date}</td>
                  <td data-label="Unit / Dept">{d.unit_name}{d.department_name && ` / ${d.department_name}`}</td>
                  <td data-label="Kind">{d.kind.replace("_", " ")}</td>
                  <td data-label="State"><StateBadge state={d.state} />{d.reconciled_by_name && <div className="small muted">reconciled by {d.reconciled_by_name}</div>}</td>
                  <td data-label="Recipients" className="small">{d.recipients_to.join(", ")}{d.recipients_cc.length > 0 && ` (cc ${d.recipients_cc.length})`}</td>
                  <td data-label="Items">{d.item_counts.total ?? (d.kind === "no_pending" ? 0 : "")}</td>
                  <td data-label="Provider" className="small">{d.provider === "console" ? <Badge tone="warning">console - not delivered</Badge> : d.provider}{d.provider_message_id && <div className="muted">{d.provider_message_id.slice(0, 40)}</div>}</td>
                  <td data-label="Attempts">{d.attempts}</td>
                  <td className="row-actions">
                    {(d.error || d.hold_reason) && <span className="small error-text">{d.error || d.hold_reason}</span>}
                    {can("runs.manage") && ["failed", "held", "retry_authorized"].includes(d.state) && ["reminder", "no_pending"].includes(d.kind) && d.run_date === today && (
                      <Button busy={busy === `retry-${d.id}`} onClick={() => void retry(d)}>Retry</Button>
                    )}
                    {can("runs.manage") && ["uncertain", "failed", "held"].includes(d.state) && <Button variant="ghost" onClick={() => setReconcile(d)}>Reconcile</Button>}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
            <Pager page={delPage} count={deliveries.data.count} setPage={setDelPage} />
          </>
        )}
      </Card>
      {detail && <RunDetail run={detail} onClose={() => setDetail(null)} />}
      {reconcile && <ReconcileDialog delivery={reconcile} onClose={(changed) => { setReconcile(null); if (changed) refresh(); }} />}
      {runNow && (
        <Modal title="Run today's reminders now" onClose={() => setRunNow(false)} width={560}>
          <p>Syncs all sources and processes every unit-department for today. Groups already sent today are skipped; failed or held groups are retried. Uncertain deliveries are not resent until reconciled.</p>
          <Callout tone="warning">Production recipients will receive emails (reminders must be activated).</Callout>
          <Checkbox checked={confirmed} onChange={setConfirmed} label="I understand production recipients may be emailed." />
          <div className="modal-actions"><Button variant="ghost" onClick={() => setRunNow(false)}>Cancel</Button><Button variant="primary" disabled={!confirmed} busy={busy === "run"} onClick={() => void startRun()}>Run now</Button></div>
        </Modal>
      )}
    </>
  );
}

export function SyncLogsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const runs = useLoad(() => api<Page<SyncRun>>("/sync-runs/", { query: { page, status } }), [page, status]);
  const [detail, setDetail] = useState<SyncRun | null>(null);
  return (
    <>
      <PageHeader title="Sync logs" subtitle="Every source sync attempt with row counts and sanitised errors." />
      <Card actions={<Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All statuses" options={[{ value: "success", label: "Success" }, { value: "incomplete", label: "Incomplete" }, { value: "failed", label: "Failed" }]} />}>
        {runs.loading && !runs.data ? <Loading /> : runs.error ? <ErrorState message={runs.error} status={runs.status} onRetry={runs.reload} /> : !runs.data?.results.length ? <EmptyState title="No sync runs yet." /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Started</th><th>Mapping</th><th>Status</th><th>Read</th><th>Imported</th><th>Rejected</th><th>Flagged</th><th>Removed</th><th>Message</th><th /></tr></thead>
              <tbody>{runs.data.results.map((r) => (
                <tr key={r.id}>
                  <td data-label="Started">{fmtDate(r.started_at)}</td><td data-label="Mapping">{r.mapping_name}</td><td data-label="Status"><StateBadge state={r.status} /></td>
                  <td data-label="Read">{r.rows_read}</td><td data-label="Imported">{r.rows_imported}</td><td data-label="Rejected">{r.rows_rejected}</td><td data-label="Flagged">{r.rows_flagged}</td>
                  <td data-label="Removed" className="small">{r.records_removed_closed} closed / {r.records_removed_missing} missing</td>
                  <td data-label="Message" className="small">{r.message}</td>
                  <td>{r.errors.length > 0 && <Button variant="ghost" onClick={() => setDetail(r)}>Errors ({r.errors.length})</Button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <Pager page={page} count={runs.data.count} setPage={setPage} />
          </>
        )}
      </Card>
      {detail && (
        <Modal title={`Sync #${detail.id} — ${detail.mapping_name}`} onClose={() => setDetail(null)} width={900}>
          <div className="table-wrap"><table className="table compact"><thead><tr><th>Type</th><th>Row</th><th>ID</th><th>Message</th></tr></thead>
            <tbody>{detail.errors.map((e, i) => <tr key={i}><td>{e.type}{e.code ? ` (${e.code})` : ""}</td><td>{e.row ?? ""}</td><td>{e.source_id ?? ""}</td><td>{e.message}</td></tr>)}</tbody></table></div>
        </Modal>
      )}
    </>
  );
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const events = useLoad(() => api<Page<AuditEvent>>("/audit/", { query: { page, action } }), [page, action]);
  const [detail, setDetail] = useState<AuditEvent | null>(null);
  return (
    <>
      <PageHeader title="Audit trail" subtitle="Configuration changes, activation, permission changes, runs, retries, reconciliations, exports and sign-ins." />
      <Card actions={<Select value={action} onChange={(v) => { setAction(v); setPage(1); }} placeholder="All actions"
        options={["create", "update", "delete", "permission_change", "activate_reminders", "deactivate_reminders", "manual_run", "manual_retry", "delivery_reconcile", "test_email", "records_export", "login", "login_failed"].map((a) => ({ value: a, label: a.replace(/_/g, " ") }))} />}>
        {events.loading && !events.data ? <Loading /> : events.error ? <ErrorState message={events.error} status={events.status} onRetry={events.reload} /> : !events.data?.results.length ? <EmptyState title="No audit events." /> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Object</th><th>IP</th><th /></tr></thead>
              <tbody>{events.data.results.map((e) => (
                <tr key={e.id}>
                  <td data-label="When">{fmtDate(e.created_at)}</td><td data-label="Who">{e.actor_username}</td><td data-label="Action">{e.action.replace(/_/g, " ")}</td>
                  <td data-label="Object" className="small">{e.object_type} {e.object_repr}</td><td data-label="IP" className="small">{e.ip_address}</td>
                  <td>{Object.keys(e.changes).length > 0 && <Button variant="ghost" onClick={() => setDetail(e)}>Changes</Button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
            <Pager page={page} count={events.data.count} setPage={setPage} />
          </>
        )}
      </Card>
      {detail && <Modal title={`${detail.action} — ${detail.object_repr}`} onClose={() => setDetail(null)}><pre className="code">{JSON.stringify(detail.changes, null, 2)}</pre></Modal>}
    </>
  );
}
