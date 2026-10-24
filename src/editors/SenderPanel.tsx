import { useState } from "react";
import { api, ApiError, type FieldErrors } from "../api/client";
import { loadGroups, loadSenders } from "../api/lookups";
import type { Delivery, SenderProfile, SenderProviderKey } from "../api/types";
import { useFeedback } from "../components/feedback";
import { FormFields, type Draft, type FieldSpec } from "../components/ResourceManager";
import { Badge, Button, Callout, Card, EmptyState, ErrorState, Field, Loading, Modal, Select, StateBadge, TextInput } from "../components/ui";
import { fmtDate } from "../lib/format";
import { useLoad } from "../hooks/useLoad";

const PROVIDERS: { value: SenderProviderKey; label: string }[] = [
  { value: "microsoft_graph", label: "Microsoft 365 (Graph sendMail)" },
  { value: "gmail_api", label: "Google Gmail API" },
  { value: "smtp", label: "SMTP (only if your provider allows it)" },
  { value: "console", label: "Log only - testing, nothing is delivered" },
];

const GUIDANCE: Record<SenderProviderKey, string[]> = {
  microsoft_graph: [
    "IT registers an app in Microsoft Entra ID and grants the Mail.Send APPLICATION permission with admin consent.",
    "Restrict the app to the reminder mailbox using an Exchange application access policy.",
    "Does not need SMTP AUTH. The server needs <PREFIX>_GRAPH_TENANT_ID, _GRAPH_CLIENT_ID and _GRAPH_CLIENT_SECRET.",
  ],
  gmail_api: [
    "Enable the Gmail API in Google Cloud and create an OAuth client.",
    "Obtain a refresh token for the sender account with the gmail.send scope.",
    "The server needs <PREFIX>_GMAIL_CLIENT_ID, _GMAIL_CLIENT_SECRET and _GMAIL_REFRESH_TOKEN.",
  ],
  smtp: [
    "Only works if your tenant/provider permits SMTP AUTH (many Microsoft 365 tenants disable it).",
    "Gmail requires 2-step verification and an app password.",
    "The server needs <PREFIX>_SMTP_PASSWORD. Enter host, port and username below.",
  ],
  console: ["For testing only: the server logs that an email would be sent. Nothing reaches any mailbox."],
};

const BASE_FIELDS: FieldSpec[] = [
  { key: "name", label: "Profile name", type: "text", required: true },
  { key: "provider", label: "Provider", type: "select", options: PROVIDERS, required: true },
  { key: "from_address", label: "From address (mailbox)", type: "text", required: true, placeholder: "qa-reminders@company.com" },
  { key: "from_name", label: "From display name", type: "text" },
  { key: "reply_to", label: "Reply-to (optional)", type: "text" },
  { key: "secret_env_prefix", label: "Secret environment prefix", type: "text", required: true, placeholder: "SENDER_MAIN",
    help: "Credentials are read from server environment variables with this prefix. They are never entered or shown here." },
  { key: "is_default", label: "Default sender for reminders", type: "checkbox" },
  { key: "active", label: "Active", type: "checkbox" },
];

const DEFAULTS: Draft = { name: "", provider: "microsoft_graph", from_address: "", from_name: "QA Reminders", reply_to: "", secret_env_prefix: "SENDER_MAIN",
  is_default: true, active: true, settings: { host: "", port: 587, security: "starttls", username: "" } };

function SenderForm({ initial, onDone }: { initial: Draft & { id?: number }; onDone: () => void }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const { toast, fail } = useFeedback();
  const provider = draft.provider as SenderProviderKey;
  const settings = (draft.settings as Draft) ?? {};
  const setSetting = (k: string, v: unknown) => setDraft({ ...draft, settings: { ...settings, [k]: v } });

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      if (initial.id) await api(`/senders/${initial.id}/`, { method: "PATCH", body: draft });
      else await api("/senders/", { method: "POST", body: draft });
      toast("Sender saved. Run 'Test connection' next.");
      onDone();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Callout title="What IT needs to set up" tone="info">
        <ul>{GUIDANCE[provider]?.map((g) => <li key={g}>{g.replace("<PREFIX>", String(draft.secret_env_prefix || "PREFIX"))}</li>)}</ul>
      </Callout>
      <FormFields fields={BASE_FIELDS} draft={draft} setDraft={setDraft} errors={errors} isNew={!initial.id} />
      {provider === "smtp" && (
        <div className="form-grid">
          <Field label="SMTP host" required error={errors.settings}>{(id) => <TextInput id={id} value={String(settings.host ?? "")} onChange={(v) => setSetting("host", v)} />}</Field>
          <Field label="Port">{(id) => <TextInput id={id} type="number" value={settings.port as number} onChange={(v) => setSetting("port", Number(v))} />}</Field>
          <Field label="Security">
            {(id) => <Select id={id} value={String(settings.security ?? "starttls")} onChange={(v) => setSetting("security", v)}
              options={[{ value: "starttls", label: "STARTTLS" }, { value: "ssl", label: "SSL/TLS" }, { value: "none", label: "None (not recommended)" }]} />}
          </Field>
          <Field label="Username (defaults to from address)">{(id) => <TextInput id={id} value={String(settings.username ?? "")} onChange={(v) => setSetting("username", v)} />}</Field>
        </div>
      )}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" busy={busy} onClick={() => void save()}>Save sender</Button>
      </div>
    </>
  );
}

export function TestEmailDialog({ sender, onClose }: { sender: SenderProfile; onClose: () => void }) {
  const groups = useLoad(loadGroups, []);
  const [recipient, setRecipient] = useState("");
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ result: string; message: string; delivered_by_provider: boolean; delivery: Delivery } | null>(null);
  const { fail } = useFeedback();
  const send = async () => {
    setBusy(true);
    try {
      setResult(await api(`/senders/${sender.id}/test-email/`, { method: "POST", body: { recipient, group_id: groupId || null } }));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Send test email - ${sender.name}`} onClose={onClose} width={560}>
      <p className="muted">The test goes ONLY to the address below. Production recipients are never contacted. The subject is prefixed with [TEST].</p>
      <Field label="Test recipient" required>{(id) => <TextInput id={id} type="email" value={recipient} onChange={setRecipient} placeholder="you@company.com" />}</Field>
      <Field label="Content" help="Use sample data, or today's real reminder content for one unit-department.">
        {(id) => <Select id={id} value={groupId} onChange={setGroupId} placeholder="Sample data"
          options={(groups.data ?? []).map((g) => ({ value: g.id, label: `Real data: ${g.unit_name} / ${g.department_name}` }))} />}
      </Field>
      {result && (
        <Callout tone={result.result === "sent" ? (result.delivered_by_provider ? "good" : "warning") : result.result === "uncertain" ? "warning" : "critical"}
          title={result.result === "sent" ? (result.delivered_by_provider ? "Accepted by provider" : "Logged only - NOT delivered") : result.result === "uncertain" ? "Delivery uncertain" : "Failed"}>
          {result.message}
          {result.delivery.provider_message_id && <div className="small muted">Provider reference: {result.delivery.provider_message_id}</div>}
        </Callout>
      )}
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="primary" busy={busy} disabled={!recipient} onClick={() => void send()}>Send test</Button>
      </div>
    </Modal>
  );
}

export function SenderPanel({ onChange }: { onChange?: () => void }) {
  const senders = useLoad(loadSenders, []);
  const [editing, setEditing] = useState<(Draft & { id?: number }) | null>(null);
  const [testing, setTesting] = useState<SenderProfile | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { toast, fail, withImpacts } = useFeedback();

  const refresh = () => {
    void senders.reload();
    onChange?.();
  };
  const testConnection = async (s: SenderProfile) => {
    setBusyId(s.id);
    try {
      const r = await api<{ ok: boolean; status: string; message: string }>(`/senders/${s.id}/test-connection/`, { method: "POST" });
      toast(r.message, r.ok ? "success" : "error");
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusyId(null);
    }
  };
  const remove = async (s: SenderProfile) => {
    try {
      const done = await withImpacts(async (c) => {
        await api(`/senders/${s.id}/`, { method: "DELETE", query: c ? { confirm: "true" } : undefined });
        return true;
      }, `Delete ${s.name}?`);
      if (done) refresh();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <Card title="Email senders" actions={<Button variant="primary" onClick={() => setEditing({ ...DEFAULTS })}>Add sender</Button>}>
      {senders.loading && !senders.data ? <Loading /> : senders.error ? <ErrorState message={senders.error} status={senders.status} onRetry={senders.reload} /> :
        !senders.data?.length ? <EmptyState title="No sender configured">Add a sender. Use "Log only" until IT provides credentials.</EmptyState> : (
          <div className="stack">
            {senders.data.map((s) => (
              <div className="item-row" key={s.id}>
                <div className="item-main">
                  <div className="item-title">
                    {s.name} {s.is_default && <Badge tone="info">default</Badge>} {!s.active && <Badge>inactive</Badge>}
                    {!s.delivers && <Badge tone="warning">log only - not delivered</Badge>}
                  </div>
                  <div className="muted small">{PROVIDERS.find((p) => p.value === s.provider)?.label} · from {s.from_address}</div>
                  <div className="small">
                    Credentials on server:{" "}
                    {Object.keys(s.secret_status).length === 0 ? "none needed" : Object.entries(s.secret_status).map(([k, ok]) => (
                      <Badge key={k} tone={ok ? "good" : "critical"}>{k} {ok ? "set" : "missing"}</Badge>
                    ))}
                  </div>
                  <div className="small">Last test: <StateBadge state={s.last_test_status || null} /> {s.last_test_at && fmtDate(s.last_test_at)} <span className="muted">{s.last_test_message}</span></div>
                </div>
                <div className="row-actions">
                  <Button busy={busyId === s.id} onClick={() => void testConnection(s)}>Test connection</Button>
                  <Button onClick={() => setTesting(s)}>Send test email</Button>
                  <Button variant="ghost" onClick={() => setEditing({ ...(s as unknown as Draft), id: s.id })}>Edit</Button>
                  <Button variant="ghost" className="danger-text" onClick={() => void remove(s)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      {editing && (
        <Modal title={editing.id ? "Edit sender" : "Add sender"} onClose={() => setEditing(null)}>
          <SenderForm initial={editing} onDone={() => { setEditing(null); refresh(); }} />
        </Modal>
      )}
      {testing && <TestEmailDialog sender={testing} onClose={() => { setTesting(null); refresh(); }} />}
    </Card>
  );
}
