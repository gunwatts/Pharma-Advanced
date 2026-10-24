import { useState, type ReactNode } from "react";
import { api, ApiError, listAll, type FieldErrors, type Query } from "../api/client";
import type { Option } from "../api/types";
import { useLoad } from "../hooks/useLoad";
import { useFeedback } from "./feedback";
import { Button, Card, Checkbox, ChipsInput, EmptyState, ErrorState, Field, Loading, Modal, MultiSelect, Select, TextArea, TextInput } from "./ui";

export type FieldKind = "text" | "number" | "textarea" | "select" | "multiselect" | "checkbox" | "chips" | "emails" | "password";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldKind;
  options?: Option[];
  required?: boolean;
  help?: ReactNode;
  placeholder?: string;
  createOnly?: boolean;
  numeric?: boolean; // select values are numbers
  hidden?: (draft: Draft) => boolean;
}

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
}

export type Draft = Record<string, unknown>;

interface Props<T extends { id: number }> {
  title: string;
  description?: ReactNode;
  endpoint: string;
  query?: Query;
  columns: Column<T>[];
  fields: FieldSpec[];
  defaults: Draft;
  canEdit?: boolean;
  canCreate?: boolean;
  canDelete?: boolean;
  rowActions?: (row: T, reload: () => void) => ReactNode;
  toPayload?: (draft: Draft, isNew: boolean) => Draft;
  emptyText?: string;
  itemLabel?: (row: T) => string;
  deps?: unknown[];
  onSaved?: () => void;
}

export function FormFields({ fields, draft, setDraft, errors, isNew }: { fields: FieldSpec[]; draft: Draft; setDraft: (d: Draft) => void; errors: FieldErrors; isNew: boolean }) {
  const set = (key: string, value: unknown) => setDraft({ ...draft, [key]: value });
  return (
    <div className="form-grid">
      {fields
        .filter((f) => !(f.createOnly && !isNew) && !f.hidden?.(draft))
        .map((f) => {
          const value = draft[f.key];
          if (f.type === "checkbox")
            return (
              <div className="field" key={f.key}>
                <Checkbox checked={!!value} onChange={(v) => set(f.key, v)} label={f.label} help={f.help} />
                {errors[f.key]?.map((e) => <div className="error-text" key={e}>{e}</div>)}
              </div>
            );
          return (
            <Field key={f.key} label={f.label} help={f.help} error={errors[f.key]} required={f.required}>
              {(id) => {
                switch (f.type) {
                  case "textarea":
                    return <TextArea id={id} value={String(value ?? "")} onChange={(v) => set(f.key, v)} placeholder={f.placeholder} />;
                  case "number":
                    return <TextInput id={id} type="number" value={value as number} onChange={(v) => set(f.key, v === "" ? null : Number(v))} />;
                  case "select":
                    return (
                      <Select id={id} value={value as string} options={f.options ?? []} placeholder={f.required ? "Select…" : "— None —"}
                        onChange={(v) => set(f.key, v === "" ? null : f.numeric ? Number(v) : v)} />
                    );
                  case "multiselect":
                    return <MultiSelect value={(value as (string | number)[]) ?? []} options={f.options ?? []} onChange={(v) => set(f.key, v)} />;
                  case "chips":
                  case "emails":
                    return <ChipsInput id={id} value={(value as string[]) ?? []} onChange={(v) => set(f.key, v)} placeholder={f.placeholder} email={f.type === "emails"} />;
                  case "password":
                    return <TextInput id={id} type="password" autoComplete="new-password" value={String(value ?? "")} onChange={(v) => set(f.key, v)} />;
                  default:
                    return <TextInput id={id} value={String(value ?? "")} onChange={(v) => set(f.key, v)} placeholder={f.placeholder} />;
                }
              }}
            </Field>
          );
        })}
    </div>
  );
}

export function ResourceManager<T extends { id: number }>(props: Props<T>) {
  const { title, description, endpoint, query, columns, fields, defaults, canEdit = true, canCreate = true, canDelete = true } = props;
  const { toast, fail, withImpacts, confirm } = useFeedback();
  const list = useLoad(() => listAll<T>(endpoint, query), [endpoint, JSON.stringify(query), ...(props.deps ?? [])]);
  const [editing, setEditing] = useState<{ draft: Draft; id: number | null } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const label = props.itemLabel ?? ((row: T) => String((row as unknown as Draft).name ?? (row as unknown as Draft).username ?? row.id));

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setErrors({});
    const isNew = editing.id === null;
    const payload = props.toPayload ? props.toPayload(editing.draft, isNew) : editing.draft;
    try {
      const done = await withImpacts(async (confirmed) => {
        if (isNew) await api(endpoint, { method: "POST", body: payload });
        else await api(`${endpoint}${editing.id}/`, { method: "PATCH", body: payload, query: confirmed ? { confirm: "true" } : undefined });
        return true;
      });
      if (!done) return; // user cancelled after reviewing impacts
      toast(isNew ? "Created." : "Saved.");
      setEditing(null);
      void list.reload();
      props.onSaved?.();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: T) => {
    if (!(await confirm({ title: `Delete ${label(row)}?`, message: "This cannot be undone. Consider deactivating instead.", confirmLabel: "Delete", danger: true }))) return;
    try {
      const done = await withImpacts(async (confirmed) => {
        await api(`${endpoint}${row.id}/`, { method: "DELETE", query: confirmed ? { confirm: "true" } : undefined });
        return true;
      }, "This item is in use");
      if (!done) return;
      toast("Deleted.");
      void list.reload();
      props.onSaved?.();
    } catch (err) {
      const used = err instanceof ApiError && Array.isArray((err.data as Draft)?.used_by) ? ` Used by: ${((err.data as Draft).used_by as string[]).join(", ")}` : "";
      fail(new Error(`${(err as Error).message}${used}`));
    }
  };

  return (
    <Card
      title={title}
      actions={
        canEdit && canCreate ? (
          <Button variant="primary" onClick={() => { setErrors({}); setEditing({ draft: { ...defaults }, id: null }); }}>
            Add
          </Button>
        ) : undefined
      }
    >
      {description && <p className="muted">{description}</p>}
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error ? (
        <ErrorState message={list.error} status={list.status} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <EmptyState title={props.emptyText ?? "Nothing configured yet."} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.data.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => (
                    <td key={c.key} data-label={c.label}>
                      {c.render ? c.render(row) : String((row as unknown as Draft)[c.key] ?? "")}
                    </td>
                  ))}
                  <td className="row-actions">
                    {props.rowActions?.(row, list.reload)}
                    {canEdit && (
                      <Button variant="ghost" onClick={() => { setErrors({}); setEditing({ draft: { ...(row as unknown as Draft) }, id: row.id }); }}>
                        Edit
                      </Button>
                    )}
                    {canEdit && canDelete && (
                      <Button variant="ghost" className="danger-text" onClick={() => void remove(row)}>
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <Modal title={`${editing.id === null ? "Add" : "Edit"} ${title.replace(/s$/, "").toLowerCase()}`} onClose={() => setEditing(null)}>
          <FormFields fields={fields} draft={editing.draft} setDraft={(d) => setEditing({ ...editing, draft: d })} errors={errors} isNew={editing.id === null} />
          {errors.non_field_errors && <div className="error-text">{errors.non_field_errors.join(" ")}</div>}
          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" busy={saving} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
