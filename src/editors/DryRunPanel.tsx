import { useState } from "react";
import { api } from "../api/client";
import type { DryRunPreview, EvalItem, PreviewGroup } from "../api/types";
import { useFeedback } from "../components/feedback";
import { Badge, Button, Callout, Card, Checkbox, EmptyState, StateBadge } from "../components/ui";
import { fmtDate } from "../lib/format";
import { EmailFrame } from "./TemplatePanel";

const ACTION_LABEL: Record<PreviewGroup["action"], string> = { reminder: "Reminder email", no_pending: "“No pending” email", held: "Held - no email", none: "No email" };

function ItemTable({ items, showReason }: { items: EvalItem[]; showReason?: boolean }) {
  if (!items.length) return <p className="muted small">None.</p>;
  return (
    <div className="table-wrap">
      <table className="table compact">
        <thead><tr><th>Category</th><th>ID</th><th>Title</th><th>Target date</th><th>Status</th>{showReason && <th>Reason</th>}<th>Parent</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={`${i.record_id}-${i.reason}`}>
              <td>{i.category}</td><td>{i.source_id}</td><td>{i.title}</td><td>{fmtDate(i.target_date)}</td><td>{i.status}</td>
              {showReason && <td><span className="small">{i.reason_label}{i.detail ? ` — ${i.detail}` : ""}</span></td>}
              <td className="small">{i.parent ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DryRunResult({ preview }: { preview: DryRunPreview }) {
  const [open, setOpen] = useState<number | null>(null);
  const t = preview.totals;
  return (
    <div className="stack">
      <div className="stat-row">
        <div className="stat"><span className="stat-value">{t.reminder}</span><span className="stat-label">reminder emails</span></div>
        <div className="stat"><span className="stat-value">{t.no_pending}</span><span className="stat-label">“no pending” emails</span></div>
        <div className="stat"><span className="stat-value">{t.held}</span><span className="stat-label">held groups</span></div>
        <div className="stat"><span className="stat-value">{t.included_items}</span><span className="stat-label">items to remind</span></div>
      </div>
      {preview.sync.length > 0 && (
        <details><summary>Sync results ({preview.sync.length})</summary>
          <ul>{preview.sync.map((s) => <li key={s.mapping_id}><StateBadge state={s.status} /> {s.mapping}: {s.message}</li>)}</ul></details>
      )}
      {preview.untrusted.length > 0 && <Callout tone="critical" title="Incomplete or failed sources — affected groups are held"><ul>{preview.untrusted.map((u) => <li key={u}>{u}</li>)}</ul></Callout>}
      {preview.warnings.length > 0 && <Callout tone="warning" title="Warnings"><ul>{preview.warnings.map((u) => <li key={u}>{u}</li>)}</ul></Callout>}
      {preview.unrouted.length > 0 && <Callout tone="warning" title={`${preview.unrouted.length} record(s) have no recipient group`}><ItemTable items={preview.unrouted} showReason /></Callout>}
      {preview.groups.length === 0 && <EmptyState title="No active recipient groups." />}
      {preview.groups.map((g) => (
        <div className="group-card" key={g.group_id}>
          <button type="button" className="group-head" aria-expanded={open === g.group_id} onClick={() => setOpen(open === g.group_id ? null : g.group_id)}>
            <span><strong>{g.unit} / {g.department}</strong> <span className="muted small">→ {g.to.join(", ")}</span></span>
            <span>
              <Badge tone={g.action === "reminder" ? "good" : g.action === "held" ? "warning" : "info"}>{ACTION_LABEL[g.action]}</Badge>{" "}
              <span className="small muted">{g.included.length} included · {g.excluded.length} excluded</span>
            </span>
          </button>
          {open === g.group_id && (
            <div className="group-body stack">
              {g.hold_reasons.length > 0 && <Callout tone="warning" title="Why this group is held"><ul>{g.hold_reasons.map((r) => <li key={r}>{r}</li>)}</ul></Callout>}
              <h4>Included</h4>
              <ItemTable items={g.included} />
              <h4>Excluded (with reasons)</h4>
              <ItemTable items={g.excluded} showReason />
              {g.email && (<><h4>Email preview: {g.email.subject}</h4>{g.email.html && <EmailFrame html={g.email.html} title={`Preview ${g.unit} ${g.department}`} />}</>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function DryRunPanel({ onDone }: { onDone?: () => void }) {
  const [sync, setSync] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DryRunPreview | null>(null);
  const { fail } = useFeedback();
  const run = async () => {
    setBusy(true);
    try {
      setPreview(await api<DryRunPreview>("/runs/dry-run/", { method: "POST", body: { sync } }));
      onDone?.();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Dry run" actions={<Button variant="primary" busy={busy} onClick={() => void run()}>Run dry run</Button>}>
      <p className="muted">Evaluates everything exactly like the daily run and renders each email, but sends nothing and does not touch the delivery ledger.</p>
      <Checkbox checked={sync} onChange={setSync} label="Sync sources first (recommended)" />
      {preview && <DryRunResult preview={preview} />}
    </Card>
  );
}
