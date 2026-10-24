import { useState } from "react";
import { api, ApiError, listAll, type FieldErrors } from "../../api/client";
import { DAY_LABELS, loadSenders, toOptions } from "../../api/lookups";
import type { JobSchedule, SystemSettings } from "../../api/types";
import { useFeedback } from "../../components/feedback";
import { Badge, Button, Callout, Card, Checkbox, ChipsInput, ErrorState, Field, Loading, MultiSelect, Select, StateBadge, TextInput } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { useLoad } from "../../hooks/useLoad";

const JOB_LABELS: Record<string, string> = { daily_reminders: "Daily reminder run (sync + email)", sync_sources: "Sync sources only (no email)" };

function ScheduleRow({ schedule, onSaved }: { schedule: JobSchedule; onSaved: () => void }) {
  const [draft, setDraft] = useState(schedule);
  const [busy, setBusy] = useState(false);
  const { toast, fail } = useFeedback();
  const dirty = JSON.stringify(draft) !== JSON.stringify(schedule);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/schedules/${schedule.id}/`, { method: "PATCH", body: { enabled: draft.enabled, run_time: draft.run_time, days_of_week: draft.days_of_week } });
      toast("Schedule saved.");
      onSaved();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="item-row">
      <div className="item-main stack">
        <div className="item-title">{JOB_LABELS[schedule.job] ?? schedule.job}</div>
        <div className="inline wrap">
          <Checkbox checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label="Enabled" />
          <label className="inline small">Time (business timezone) <TextInput type="time" value={draft.run_time.slice(0, 5)} onChange={(v) => setDraft({ ...draft, run_time: v })} /></label>
        </div>
        <MultiSelect value={draft.days_of_week} options={DAY_LABELS.map((d, i) => ({ value: i, label: d }))} onChange={(v) => setDraft({ ...draft, days_of_week: v as number[] })} emptyLabel="every day" />
        <div className="small muted">
          Next run: {schedule.next_run_at ? fmtDate(schedule.next_run_at) : "—"} · Last run: {schedule.last_run_date ?? "never"} <StateBadge state={schedule.last_status || null} />
        </div>
      </div>
      <div className="row-actions"><Button variant="primary" disabled={!dirty} busy={busy} onClick={() => void save()}>Save</Button></div>
    </div>
  );
}

export function SchedulesSection() {
  const schedules = useLoad(() => listAll<JobSchedule>("/schedules/"), []);
  const settings = useLoad(() => api<SystemSettings>("/settings/"), []);
  const senders = useLoad(loadSenders, []);
  const [draft, setDraft] = useState<SystemSettings | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const { toast, fail } = useFeedback();
  const s = draft ?? settings.data;
  const set = (patch: Partial<SystemSettings>) => s && setDraft({ ...s, ...patch });

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setErrors({});
    try {
      const { business_timezone, default_window_days, send_no_pending_email, alert_recipients, alert_sender_profile, max_send_attempts } = draft;
      settings.setData(await api<SystemSettings>("/settings/", { method: "PATCH", body: { business_timezone, default_window_days, send_no_pending_email, alert_recipients, alert_sender_profile, max_send_attempts } }));
      setDraft(null);
      toast("Settings saved.");
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <Card title="Job schedules">
        <Callout tone="info">Jobs run on the server independently of any browser. The server's scheduler (PythonAnywhere scheduled task, cron or a service) triggers them; each job runs at most once per business day.</Callout>
        {schedules.loading && !schedules.data ? <Loading /> : schedules.error ? <ErrorState message={schedules.error} status={schedules.status} /> :
          <div className="stack">{schedules.data?.map((sc) => <ScheduleRow key={`${sc.id}-${sc.last_run_date}-${sc.enabled}`} schedule={sc} onSaved={() => void schedules.reload()} />)}</div>}
      </Card>
      <Card title="System settings" actions={s?.reminders_active ? <Badge tone="good">reminders active</Badge> : <Badge tone="warning">reminders not active</Badge>}>
        {settings.loading && !s ? <Loading /> : settings.error ? <ErrorState message={settings.error} status={settings.status} /> : s && (
          <div className="stack">
            <div className="form-grid">
              <Field label="Business timezone" error={errors.business_timezone} help="Defines 'today' for date eligibility, e.g. Asia/Kolkata.">{(id) => <TextInput id={id} value={s.business_timezone} onChange={(v) => set({ business_timezone: v })} />}</Field>
              <Field label="Default reminder window (days)" error={errors.default_window_days}>{(id) => <TextInput id={id} type="number" value={s.default_window_days} onChange={(v) => set({ default_window_days: Number(v) })} />}</Field>
              <Field label="Maximum automatic send attempts" error={errors.max_send_attempts}>{(id) => <TextInput id={id} type="number" value={s.max_send_attempts} onChange={(v) => set({ max_send_attempts: Number(v) })} />}</Field>
              <Field label="Sender for admin alerts">{(id) => <Select id={id} value={s.alert_sender_profile ?? ""} placeholder="Default sender" options={toOptions(senders.data)} onChange={(v) => set({ alert_sender_profile: v ? Number(v) : null })} />}</Field>
            </div>
            <Field label="Operational alert recipients" error={errors.alert_recipients} help="Notified when a run has failed/held/uncertain deliveries or source problems.">
              {(id) => <ChipsInput id={id} email value={s.alert_recipients} onChange={(v) => set({ alert_recipients: v })} placeholder="qa-admin@company.com" />}
            </Field>
            <Checkbox checked={s.send_no_pending_email} onChange={(v) => set({ send_no_pending_email: v })} label="Send a daily “no pending reminders” email when nothing is due (only after complete, validated processing)" />
            <div><Button variant="primary" disabled={!draft} busy={busy} onClick={() => void save()}>Save settings</Button></div>
            <p className="small muted">Configuration version {s.config_version}. Activation is managed in Quick Start.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
