import { useRef, useState } from "react";
import { api, ApiError, listAll, type FieldErrors } from "../api/client";
import { loadGroups } from "../api/lookups";
import type { EmailPreview, EmailTemplate } from "../api/types";
import { useFeedback } from "../components/feedback";
import { Badge, Button, Callout, Card, Checkbox, EmptyState, ErrorState, Field, Loading, Select, Tabs, TextInput } from "../components/ui";
import { useLoad } from "../hooks/useLoad";

type TextKey = "subject" | "intro_text" | "outro_text" | "no_pending_subject" | "no_pending_text";

/** Renders untrusted email HTML in a fully sandboxed frame (no scripts, no same-origin access). */
export function EmailFrame({ html, title }: { html: string; title: string }) {
  return <iframe className="email-frame" title={title} sandbox="" srcDoc={html} />;
}

export function TemplatePanel({ onChange }: { onChange?: () => void }) {
  const templates = useLoad(() => listAll<EmailTemplate>("/templates/"), []);
  const placeholders = useLoad(() => api<{ key: string; label: string }[]>("/templates/placeholders/"), []);
  const groups = useLoad(loadGroups, []);
  const [selected, setSelected] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Partial<EmailTemplate> | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [previewGroup, setPreviewGroup] = useState("");
  const [tab, setTab] = useState<"reminder" | "no_pending">("reminder");
  const [focus, setFocus] = useState<TextKey>("intro_text");
  const [busy, setBusy] = useState<string | null>(null);
  const refs = useRef<Partial<Record<TextKey, HTMLTextAreaElement | HTMLInputElement | null>>>({});
  const { toast, fail, withImpacts } = useFeedback();

  const current = draft ?? (templates.data?.find((t) => t.is_active) ?? templates.data?.[0]);
  const editing = draft !== null;
  const open = (t: EmailTemplate | null) => {
    setErrors({});
    setPreview(null);
    if (t) {
      setSelected(t.id);
      setDraft({ ...t });
    } else {
      setSelected("new");
      setDraft({ name: "", subject: "QA reminders for {{ unit_name }} / {{ department_name }} - {{ run_date }}", intro_text: "Dear {{ department_name }} team,", outro_text: "Regards,\nQA",
        no_pending_subject: "No pending QA reminders - {{ unit_name }} / {{ department_name }}", no_pending_text: "All sources were synced successfully. Nothing is due in the next {{ window_days }} days.", show_parent_context: true });
    }
  };
  const insert = (key: string) => {
    if (!draft) return;
    const token = `{{ ${key} }}`;
    const el = refs.current[focus];
    const value = String(draft[focus] ?? "");
    const pos = el?.selectionStart ?? value.length;
    setDraft({ ...draft, [focus]: value.slice(0, pos) + token + value.slice(el?.selectionEnd ?? pos) });
  };
  const runPreview = async () => {
    if (!current) return;
    setBusy("preview");
    setErrors({});
    try {
      setPreview(await api<EmailPreview>("/templates/preview/", { method: "POST", body: { ...current, group_id: previewGroup || null } }));
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(err);
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    if (!draft) return;
    setBusy("save");
    setErrors({});
    try {
      const done = await withImpacts(async (c) => {
        if (selected === "new") await api("/templates/", { method: "POST", body: draft });
        else await api(`/templates/${selected}/`, { method: "PATCH", body: draft, query: c ? { confirm: "true" } : undefined });
        return true;
      }, "Update the active template?");
      if (!done) return;
      toast("Template saved.");
      setDraft(null);
      setSelected(null);
      void templates.reload();
      onChange?.();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(err);
    } finally {
      setBusy(null);
    }
  };
  const activate = async (t: EmailTemplate) => {
    try {
      await api(`/templates/${t.id}/activate/`, { method: "POST" });
      toast(`"${t.name}" is now active.`);
      void templates.reload();
      onChange?.();
    } catch (err) {
      fail(err);
    }
  };

  const textField = (key: TextKey, label: string, multiline = false) => (
    <Field label={label} error={errors[key]}>
      {(id) => multiline ? (
        <textarea id={id} className="input" rows={5} value={String(draft?.[key] ?? "")} ref={(el) => { refs.current[key] = el; }} onFocus={() => setFocus(key)} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
      ) : (
        <input id={id} className="input" value={String(draft?.[key] ?? "")} ref={(el) => { refs.current[key] = el; }} onFocus={() => setFocus(key)} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
      )}
    </Field>
  );

  if (templates.loading && !templates.data) return <Card title="Email template"><Loading /></Card>;
  if (templates.error) return <Card title="Email template"><ErrorState message={templates.error} status={templates.status} onRetry={templates.reload} /></Card>;
  return (
    <Card title="Email template" actions={<Button onClick={() => open(null)}>New template</Button>}>
      <div className="stack">
        {!templates.data?.length && <EmptyState title="No template yet" />}
        <div className="chip-row">
          {templates.data?.map((t) => (
            <span key={t.id} className="item-chip">
              <button type="button" className="link" onClick={() => open(t)}>{t.name}</button> {t.is_active ? <Badge tone="good">active</Badge> : <Button variant="ghost" onClick={() => void activate(t)}>Make active</Button>}
            </span>
          ))}
        </div>
        {editing && (
          <>
            <Field label="Template name" error={errors.name}>{(id) => <TextInput id={id} value={draft?.name} onChange={(v) => setDraft({ ...draft, name: v })} />}</Field>
            <div className="placeholder-bar" aria-label="Insert placeholder">
              <span className="small muted">Insert into “{focus.replace(/_/g, " ")}”:</span>
              {placeholders.data?.map((p) => <button type="button" key={p.key} className="chip" title={p.label} onClick={() => insert(p.key)}>{`{{ ${p.key} }}`}</button>)}
            </div>
            <Tabs tabs={[{ key: "reminder", label: "Reminder email" }, { key: "no_pending", label: "“No pending” email" }]} value={tab} onChange={setTab} />
            {tab === "reminder" ? (
              <>
                {textField("subject", "Subject")}
                {textField("intro_text", "Opening text", true)}
                <Callout tone="info">The record tables (QMS records, audits & observations, action items) are generated automatically between the opening and closing text. Only safe placeholders are allowed; all values are HTML-escaped.</Callout>
                {textField("outro_text", "Closing text", true)}
                <Checkbox checked={!!draft?.show_parent_context} onChange={(v) => setDraft({ ...draft, show_parent_context: v })} label="Show parent record context (e.g. the audit/observation an action item belongs to)" />
              </>
            ) : (
              <>
                {textField("no_pending_subject", "Subject")}
                {textField("no_pending_text", "Text", true)}
                <Callout tone="info">Sent only when every relevant source synced and validated successfully and nothing is due.</Callout>
              </>
            )}
          </>
        )}
        <div className="inline wrap">
          <Select value={previewGroup} onChange={setPreviewGroup} placeholder="Preview with sample data" options={(groups.data ?? []).map((g) => ({ value: g.id, label: `Preview with real data: ${g.unit_name} / ${g.department_name}` }))} />
          <Button busy={busy === "preview"} onClick={() => void runPreview()} disabled={!current}>Preview</Button>
          {editing && <><Button variant="ghost" onClick={() => { setDraft(null); setSelected(null); }}>Cancel</Button><Button variant="primary" busy={busy === "save"} onClick={() => void save()}>Save template</Button></>}
        </div>
        {preview && (
          <div className="stack">
            {preview.note && <Callout tone="warning">{preview.note} {preview.hold_reasons?.join(" ")}</Callout>}
            {preview.subject && (
              <>
                <div className="small"><strong>To:</strong> {preview.to?.join(", ")} {preview.cc?.length ? <><strong> Cc:</strong> {preview.cc.join(", ")}</> : null}</div>
                <div><strong>Subject:</strong> {preview.subject}</div>
                {preview.html && <EmailFrame html={preview.html} title="Email preview" />}
              </>
            )}
            {preview.no_pending && (
              <details><summary>“No pending” email preview</summary><div><strong>Subject:</strong> {preview.no_pending.subject}</div><EmailFrame html={preview.no_pending.html} title="No pending preview" /></details>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

