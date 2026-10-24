import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import type { Option } from "../api/types";
import { EMAIL_RE, stateTone, type Tone } from "../lib/format";


type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  busy,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button type="button" {...rest} className={`btn btn-${variant} ${className}`} disabled={rest.disabled || busy} aria-busy={busy || undefined}>
      {busy && <span className="spinner spinner-sm" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-header">
          {title && <h3>{title}</h3>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}


const TONE_ICON: Record<Tone, string> = { neutral: "•", good: "✓", warning: "!", serious: "!", critical: "✕", info: "i" };

/** Status badge: colour is always paired with an icon and a text label. */
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`badge badge-${tone}`}>
      <span aria-hidden className="badge-icon">
        {TONE_ICON[tone]}
      </span>
      {children}
    </span>
  );
}

export function StateBadge({ state }: { state?: string | null }) {
  return <Badge tone={stateTone(state)}>{(state || "never").replace(/_/g, " ")}</Badge>;
}

export function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state state-loading" role="status">
      <Spinner /> <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry, status }: { message: string; onRetry?: () => void; status?: number | null }) {
  if (status === 403) return <Forbidden />;
  return (
    <div className="state state-error" role="alert">
      <strong>Could not load this.</strong>
      <span>{message}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}

export function Forbidden() {
  return (
    <div className="state state-error" role="alert">
      <strong>Access denied</strong>
      <span>You do not have permission to view this page. Ask your QA administrator if you need access.</span>
    </div>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warning" | "critical" | "good"; title?: string; children: ReactNode }) {
  return (
    <div className={`callout callout-${tone}`} role={tone === "critical" ? "alert" : undefined}>
      {title && <strong>{title}</strong>}
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Modal({ title, children, onClose, width = 720 }: { title: string; children: ReactNode; onClose: () => void; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }} tabIndex={-1} ref={ref}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, help, error, children, required }: { label: string; help?: ReactNode; error?: string[] | string; children: (id: string) => ReactNode; required?: boolean }) {
  const id = useId();
  const errors = Array.isArray(error) ? error : error ? [error] : [];
  return (
    <div className={`field ${errors.length ? "field-invalid" : ""}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden> *</span>}
      </label>
      {children(id)}
      {help && <div className="help">{help}</div>}
      {errors.map((e) => (
        <div className="error-text" key={e}>
          {e}
        </div>
      ))}
    </div>
  );
}

export function TextInput({ id, value, onChange, ...rest }: { id?: string; value: string | number | null | undefined; onChange: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean; min?: number; max?: number; autoComplete?: string }) {
  return <input id={id} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function TextArea({ id, value, onChange, rows = 4, placeholder }: { id?: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea id={id} className="input" value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function Select({ id, value, onChange, options, placeholder, disabled }: { id?: string; value: string | number | null | undefined; onChange: (v: string) => void; options: Option[]; placeholder?: string; disabled?: boolean }) {
  return (
    <select id={id} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: ReactNode }) {
  const id = useId();
  return (
    <div className="checkbox">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>
        {label}
        {help && <span className="help"> {help}</span>}
      </label>
    </div>
  );
}

export function MultiSelect({ value, onChange, options, emptyLabel = "All" }: { value: (string | number)[]; onChange: (v: (string | number)[]) => void; options: Option[]; emptyLabel?: string }) {
  const toggle = (v: string | number) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="multiselect" role="group">
      {options.length === 0 && <span className="muted">No options</span>}
      {options.map((o) => (
        <button type="button" key={o.value} className={`chip ${value.includes(o.value) ? "chip-on" : ""}`} aria-pressed={value.includes(o.value)} onClick={() => toggle(o.value)}>
          {o.label}
        </button>
      ))}
      {value.length === 0 && options.length > 0 && <span className="muted small">({emptyLabel})</span>}
    </div>
  );
}

/** Free-text list input (aliases, emails, statuses). Enter or comma adds an item. */
export function ChipsInput({ id, value, onChange, placeholder, email }: { id?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; email?: boolean }) {
  const [draft, setDraft] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const add = (raw: string) => {
    const items = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!items.length) return;
    const next = [...value];
    for (const item of items) {
      if (email && !EMAIL_RE.test(item)) {
        setWarning(`"${item}" is not a valid email address.`);
        continue;
      }
      if (next.some((x) => x.toLowerCase() === item.toLowerCase())) {
        setWarning(`"${item}" is already in the list.`);
        continue;
      }
      next.push(item);
    }
    onChange(next);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div>
      <div className="chips-input">
        {value.map((v) => (
          <span key={v} className="chip chip-on">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            setWarning(null);
          }}
          onKeyDown={onKey}
          onBlur={() => draft && add(draft)}
        />
      </div>
      {warning && <div className="error-text">{warning}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key} className={`tab ${value === t.key ? "tab-on" : ""}`} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
