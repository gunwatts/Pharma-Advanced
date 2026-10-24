import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { loadSenders } from "../../api/lookups";
import type { SenderProfile, SetupStatus, SetupStep } from "../../api/types";
import { useFeedback } from "../../components/feedback";
import { Badge, Button, Callout, Card, Checkbox, ErrorState, KeyValue, Loading, PageHeader, StateBadge } from "../../components/ui";
import { fmtDate } from "../../lib/format";
import { DryRunPanel } from "../../editors/DryRunPanel";
import { MappingPanel } from "../../editors/MappingPanel";
import { OrgPanel } from "../../editors/OrgPanel";
import { RulePanel } from "../../editors/RulePanel";
import { SenderPanel, TestEmailDialog } from "../../editors/SenderPanel";
import { SourcePanel } from "../../editors/SourcePanel";
import { TemplatePanel } from "../../editors/TemplatePanel";
import { useLoad } from "../../hooks/useLoad";

const STEP_INFO: Record<SetupStep, { title: string; intro: string }> = {
  sender: { title: "Email sender", intro: "Choose how reminder emails are sent. Credentials stay on the server as environment variables; you only enter the mailbox and the variable prefix here. Then test the connection." },
  source: { title: "Data source", intro: "Tell the system where the Excel workbook lives: upload it, pick it from a server folder the application server can read, or select it in OneDrive/SharePoint." },
  organization: { title: "Units, departments & recipients", intro: "Add your units and departments (with spellings used in Excel), then who receives the daily email for each unit-department (To and Cc)." },
  mappings: { title: "Excel worksheets & column mapping", intro: "For each worksheet, pick the category and match its columns. Validate the sample to see missing columns, duplicate IDs, invalid dates and other problems before saving. Then sync." },
  rules: { title: "Reminder rules", intro: "Decide which records are reminded: the target date field, how many days ahead (default 7), and any status filters or exclusions." },
  template: { title: "Email template", intro: "Edit the wording around the automatically generated record tables. Preview with sample data or today's real data." },
  test: { title: "Dry run & test email", intro: "Check exactly who would get what, and why records are included or excluded. Then send a test email to yourself — production recipients are not contacted." },
  activate: { title: "Activate", intro: "Review the checks and turn on scheduled daily reminders." },
};

function TestStep({ onChange }: { onChange: () => void }) {
  const senders = useLoad(loadSenders, []);
  const [testing, setTesting] = useState<SenderProfile | null>(null);
  return (
    <div className="stack">
      <DryRunPanel onDone={onChange} />
      <Card title="Test email">
        <p className="muted">Sends one email to the test address you enter. The subject starts with [TEST].</p>
        <div className="inline wrap">
          {senders.data?.filter((s) => s.active).map((s) => <Button key={s.id} onClick={() => setTesting(s)}>Send test via {s.name}</Button>)}
          {senders.data?.length === 0 && <span className="muted">Add a sender first.</span>}
        </div>
      </Card>
      {testing && <TestEmailDialog sender={testing} onClose={() => { setTesting(null); onChange(); }} />}
    </div>
  );
}

function ActivateStep({ status, onChange }: { status: SetupStatus; onChange: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast, fail, confirm } = useFeedback();
  const activate = async () => {
    setBusy(true);
    try {
      await api("/setup/activate/", { method: "POST", body: { confirm: true } });
      toast("Daily reminders are now active.");
      onChange();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const deactivate = async () => {
    if (!(await confirm({ title: "Pause daily reminders?", message: "Scheduled runs will be skipped until you activate again.", confirmLabel: "Pause", danger: true }))) return;
    try {
      await api("/setup/deactivate/", { method: "POST" });
      toast("Reminders paused.");
      onChange();
    } catch (err) {
      fail(err);
    }
  };
  const blocking = status.steps.filter((s) => s !== "activate" && !status.checks[s].ok);
  return (
    <Card title="Activation">
      <KeyValue items={[
        ["Status", status.active ? <Badge tone="good">active since {fmtDate(status.activated_at)}</Badge> : <Badge tone="warning">not active</Badge>],
        ["Next scheduled run", status.schedule_enabled ? fmtDate(status.next_run_at) : <Badge tone="warning">schedule disabled</Badge>],
        ["Last successful run", status.last_successful_run ? fmtDate(status.last_successful_run.finished_at) : "never"],
        ["Last run", status.last_run ? <><StateBadge state={status.last_run.status} /> {fmtDate(status.last_run.started_at)}</> : "never"],
      ]} />
      <p className="small muted">The schedule time and run days are set in <Link to="/admin/setup?section=schedules">Advanced Setup → Schedules</Link>. On PythonAnywhere the scheduled task must also be configured (see deployment guide).</p>
      {status.active ? (
        <Button variant="danger" onClick={() => void deactivate()}>Pause reminders</Button>
      ) : (
        <div className="stack">
          {blocking.length > 0 && <Callout tone="warning" title="Complete these steps first">{blocking.map((b) => STEP_INFO[b].title).join(", ")}</Callout>}
          <Checkbox checked={confirmed} onChange={setConfirmed} label="I confirm the dry run and test email look correct, and production recipients may now receive daily reminder emails." />
          <div><Button variant="primary" busy={busy} disabled={!confirmed || !status.ready_to_activate} onClick={() => void activate()}>Activate daily reminders</Button></div>
        </div>
      )}
    </Card>
  );
}

export default function QuickStart() {
  const status = useLoad(() => api<SetupStatus>("/setup/status/"), []);
  const [step, setStep] = useState<SetupStep | null>(null);
  const { fail } = useFeedback();

  useEffect(() => {
    if (status.data && step === null) {
      const saved = status.data.wizard_state.current_step;
      setStep(saved ?? status.data.steps.find((s) => !status.data!.checks[s].ok) ?? "sender");
    }
  }, [status.data, step]);

  const go = (s: SetupStep) => {
    setStep(s);
    api("/setup/progress/", { method: "PATCH", body: { current_step: s } }).catch(fail);
    window.scrollTo({ top: 0 });
  };
  const refresh = () => void status.reload();

  if (status.loading && !status.data) return <Loading label="Checking setup…" />;
  if (status.error) return <ErrorState message={status.error} status={status.status} onRetry={status.reload} />;
  const s = status.data!;
  const current = step ?? "sender";
  const index = s.steps.indexOf(current);
  const check = s.checks[current];
  const done = s.steps.filter((x) => s.checks[x].ok).length;

  return (
    <>
      <PageHeader title="Quick Start" subtitle={`${done} of ${s.steps.length} steps complete. Your progress is saved automatically — you can leave and come back.`} />
      <div className="wizard">
        <ol className="stepper" aria-label="Setup steps">
          {s.steps.map((key, i) => (
            <li key={key}>
              <button type="button" className={`step ${key === current ? "step-current" : ""}`} aria-current={key === current ? "step" : undefined} onClick={() => go(key)}>
                <span className={`step-num ${s.checks[key].ok ? "step-done" : ""}`} aria-hidden>{s.checks[key].ok ? "✓" : i + 1}</span>
                <span>{STEP_INFO[key].title}<span className="sr-only">{s.checks[key].ok ? " (complete)" : " (incomplete)"}</span></span>
              </button>
            </li>
          ))}
        </ol>
        <div className="wizard-body stack">
          <div>
            <h2>{index + 1}. {STEP_INFO[current].title}</h2>
            <p className="muted">{STEP_INFO[current].intro}</p>
            {current !== "activate" && (
              <Callout tone={check.ok ? "good" : "warning"} title={check.ok ? "Step complete" : "Not complete yet"}>
                {check.message}
                {check.warnings.length > 0 && <ul>{check.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
              </Callout>
            )}
          </div>
          {current === "sender" && <SenderPanel onChange={refresh} />}
          {current === "source" && <SourcePanel onChange={refresh} />}
          {current === "organization" && <OrgPanel onChange={refresh} />}
          {current === "mappings" && <MappingPanel onChange={refresh} />}
          {current === "rules" && <RulePanel onChange={refresh} />}
          {current === "template" && <TemplatePanel onChange={refresh} />}
          {current === "test" && <TestStep onChange={refresh} />}
          {current === "activate" && <ActivateStep status={s} onChange={refresh} />}
          <div className="wizard-nav">
            <Button disabled={index === 0} onClick={() => go(s.steps[index - 1])}>← Back</Button>
            <Button onClick={refresh} variant="ghost">Re-check</Button>
            {index < s.steps.length - 1 && <Button variant="primary" onClick={() => go(s.steps[index + 1])}>Next →</Button>}
          </div>
        </div>
      </div>
    </>
  );
}
