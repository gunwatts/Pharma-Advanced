import { useState } from "react";
import { api, ApiError, listAll, type FieldErrors } from "../api/client";
import type { BrowseEntry, DataSource, SourceOptions, SourceProvider } from "../api/types";
import { useFeedback } from "../components/feedback";
import { Badge, Button, Callout, Card, Checkbox, EmptyState, ErrorState, Field, Loading, Modal, Select, TextInput } from "../components/ui";
import { fmtDate } from "../lib/format";
import { useLoad } from "../hooks/useLoad";

const PROVIDER_LABELS: Record<SourceProvider, string> = {
  upload: "Uploaded workbook",
  server_folder: "Server / network folder",
  graph_drive: "OneDrive / SharePoint (Microsoft Graph)",
};

function ServerBrowser({ roots, value, onPick }: { roots: string[]; value: { root?: string; path?: string }; onPick: (root: string, path: string) => void }) {
  const [root, setRoot] = useState(value.root ?? roots[0] ?? "");
  const [folder, setFolder] = useState("");
  const listing = useLoad(() => (root ? api<{ entries: BrowseEntry[] }>("/browse/server/", { query: { root, path: folder } }) : Promise.resolve({ entries: [] })), [root, folder]);
  const up = folder.split("/").slice(0, -1).join("/");
  return (
    <div>
      <Field label="Folder root (configured by IT)" help="Only folders the application SERVER can read are listed. A folder you can open from your PC is not automatically visible to the server.">
        {(id) => <Select id={id} value={root} onChange={(v) => { setRoot(v); setFolder(""); }} options={roots.map((r) => ({ value: r, label: r }))} />}
      </Field>
      <div className="browser">
        <div className="browser-path">/{folder} {folder && <Button variant="ghost" onClick={() => setFolder(up)}>Up</Button>}</div>
        {listing.loading ? <Loading /> : listing.error ? <ErrorState message={listing.error} /> : !listing.data?.entries.length ? <EmptyState title="No workbooks or folders here." /> : (
          <ul className="browser-list">
            {listing.data.entries.map((e) => (
              <li key={e.path}>
                {e.type === "folder" ? (
                  <button type="button" className="link" onClick={() => setFolder(e.path ?? "")}>📁 {e.name}</button>
                ) : (
                  <button type="button" className={`link ${value.path === e.path ? "selected" : ""}`} onClick={() => onPick(root, e.path ?? "")}>📄 {e.name}</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.path && <div className="small">Selected: <strong>{value.root}/{value.path}</strong></div>}
    </div>
  );
}

function GraphBrowser({ value, onChange }: { value: Record<string, string>; onChange: (cfg: Record<string, string>) => void }) {
  const [search, setSearch] = useState("");
  const [sites, setSites] = useState<{ id: string; name: string; url: string }[]>([]);
  const [drives, setDrives] = useState<{ id: string; name: string }[]>([]);
  const [stack, setStack] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "root" }]);
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const { fail } = useFeedback();
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  const findSites = () => run(async () => setSites((await api<{ sites: typeof sites }>("/browse/graph/", { query: { search } })).sites));
  const loadDrives = (query: Record<string, string>) => run(async () => setDrives((await api<{ drives: typeof drives }>("/browse/graph/", { query: { ...query, list_drives: 1 } })).drives));
  const browse = (driveId: string, itemId: string | null) =>
    run(async () => setEntries((await api<{ entries: BrowseEntry[] }>("/browse/graph/", { query: { drive_id: driveId, item_id: itemId ?? "" } })).entries));

  return (
    <div className="stack">
      <div className="form-grid">
        <Field label="Find SharePoint / Teams site">{(id) => <div className="inline"><TextInput id={id} value={search} onChange={setSearch} placeholder="e.g. Quality" /><Button busy={busy} onClick={() => void findSites()}>Search</Button></div>}</Field>
        <Field label="…or OneDrive user (UPN)">{(id) => <div className="inline"><TextInput id={id} value={value.user ?? ""} onChange={(v) => onChange({ ...value, user: v })} placeholder="qa.lead@company.com" /><Button onClick={() => void loadDrives({ user: value.user ?? "" })}>List drives</Button></div>}</Field>
      </div>
      {sites.length > 0 && <Field label="Site">{(id) => <Select id={id} value={value.site_id ?? ""} placeholder="Select site" options={sites.map((s) => ({ value: s.id, label: s.name }))} onChange={(v) => { onChange({ ...value, site_id: v }); void loadDrives({ site_id: v }); }} />}</Field>}
      {drives.length > 0 && <Field label="Document library / drive">{(id) => <Select id={id} value={value.drive_id ?? ""} placeholder="Select drive" options={drives.map((d) => ({ value: d.id, label: d.name }))} onChange={(v) => { onChange({ ...value, drive_id: v }); setStack([{ id: null, name: "root" }]); void browse(v, null); }} />}</Field>}
      {value.drive_id && (
        <div className="browser">
          <div className="browser-path">
            {stack.map((s, i) => <button type="button" key={i} className="link" onClick={() => { const next = stack.slice(0, i + 1); setStack(next); void browse(value.drive_id, s.id); }}>{s.name} /</button>)}
          </div>
          {busy ? <Loading /> : (
            <ul className="browser-list">
              {entries.map((e) => (
                <li key={e.id}>
                  {e.type === "folder" ? (
                    <button type="button" className="link" onClick={() => { setStack([...stack, { id: e.id ?? null, name: e.name }]); void browse(value.drive_id, e.id ?? null); }}>📁 {e.name}</button>
                  ) : (
                    <button type="button" className={`link ${value.item_id === e.id ? "selected" : ""}`} onClick={() => onChange({ ...value, item_id: e.id ?? "", display_path: [...stack.slice(1).map((s) => s.name), e.name].join("/") })}>📄 {e.name}</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {value.display_path && <div className="small">Selected: <strong>{value.display_path}</strong></div>}
    </div>
  );
}

function SourceForm({ initial, options, onDone }: { initial: Partial<DataSource>; options: SourceOptions; onDone: () => void }) {
  const [draft, setDraft] = useState<Partial<DataSource>>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const { toast, fail } = useFeedback();
  const config = draft.config ?? {};

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const body = { name: draft.name, provider: draft.provider, config, description: draft.description ?? "", active: draft.active ?? true };
      const saved = initial.id ? await api<DataSource>(`/sources/${initial.id}/`, { method: "PATCH", body }) : await api<DataSource>("/sources/", { method: "POST", body });
      if (draft.provider === "upload" && file) {
        const form = new FormData();
        form.append("file", file);
        const res = await api<{ sheets: string[] }>(`/sources/${saved.id}/upload/`, { method: "POST", body: form });
        toast(`Uploaded. Worksheets: ${res.sheets.join(", ")}`);
      } else if (draft.provider !== "upload") {
        const check = await api<{ ok: boolean; message: string }>(`/sources/${saved.id}/check/`, { method: "POST" });
        toast(check.message, check.ok ? "success" : "error");
      } else toast("Saved.");
      onDone();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="form-grid">
        <Field label="Name" required error={errors.name}>{(id) => <TextInput id={id} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />}</Field>
        <Field label="Source type" required error={errors.provider}>
          {(id) => <Select id={id} value={draft.provider} disabled={!!initial.id} onChange={(v) => setDraft({ ...draft, provider: v as SourceProvider, config: {} })}
            options={(Object.keys(PROVIDER_LABELS) as SourceProvider[]).map((k) => ({ value: k, label: PROVIDER_LABELS[k] }))} />}
        </Field>
      </div>
      {draft.provider === "upload" && (
        <Field label="Workbook (.xlsx / .xlsm)" help={`Max ${options.max_workbook_mb} MB. Only the latest uploaded file is kept; upload a new version to refresh.`}>
          {(id) => <input id={id} type="file" accept=".xlsx,.xlsm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Field>
      )}
      {draft.provider === "server_folder" && (options.server_roots.length ? (
        <ServerBrowser roots={options.server_roots} value={config} onPick={(root, path) => setDraft({ ...draft, config: { root, path } })} />
      ) : <Callout tone="warning" title="No server folders configured">IT must set SOURCE_ROOTS on the server to the folders the application may read.</Callout>)}
      {draft.provider === "graph_drive" && (options.graph_configured ? (
        <GraphBrowser value={config} onChange={(cfg) => setDraft({ ...draft, config: cfg })} />
      ) : <Callout tone="warning" title="Microsoft Graph not configured">IT must register an app (Files.Read.All or Sites.Selected, admin consent) and set GRAPH_TENANT_ID, GRAPH_CLIENT_ID and GRAPH_CLIENT_SECRET on the server.</Callout>)}
      {errors.config && <div className="error-text">{errors.config.join(" ")}</div>}
      <Checkbox checked={draft.active ?? true} onChange={(v) => setDraft({ ...draft, active: v })} label="Active" />
      <div className="modal-actions">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" busy={busy} onClick={() => void save()}>{draft.provider === "upload" ? "Save & upload" : "Save & check access"}</Button>
      </div>
    </div>
  );
}

export function SourcePanel({ onChange }: { onChange?: () => void }) {
  const sources = useLoad(() => listAll<DataSource>("/sources/"), []);
  const options = useLoad(() => api<SourceOptions>("/source-options/"), []);
  const [editing, setEditing] = useState<Partial<DataSource> | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { toast, fail, withImpacts } = useFeedback();
  const refresh = () => {
    void sources.reload();
    onChange?.();
  };
  const check = async (s: DataSource) => {
    setBusyId(s.id);
    try {
      const r = await api<{ ok: boolean; message: string }>(`/sources/${s.id}/check/`, { method: "POST" });
      toast(r.message, r.ok ? "success" : "error");
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusyId(null);
    }
  };
  const remove = async (s: DataSource) => {
    try {
      const done = await withImpacts(async (c) => {
        await api(`/sources/${s.id}/`, { method: "DELETE", query: c ? { confirm: "true" } : undefined });
        return true;
      }, `Delete ${s.name}?`);
      if (done) refresh();
    } catch (err) {
      fail(err);
    }
  };
  return (
    <Card title="Data sources" actions={<Button variant="primary" onClick={() => setEditing({ provider: "upload", active: true, config: {} })}>Add source</Button>}>
      {sources.loading && !sources.data ? <Loading /> : sources.error ? <ErrorState message={sources.error} status={sources.status} onRetry={sources.reload} /> :
        !sources.data?.length ? <EmptyState title="No data source yet">Add the workbook that holds your QMS/audit records.</EmptyState> : (
          <div className="stack">
            {sources.data.map((s) => (
              <div className="item-row" key={s.id}>
                <div className="item-main">
                  <div className="item-title">{s.name} {!s.active && <Badge>inactive</Badge>}</div>
                  <div className="muted small">
                    {PROVIDER_LABELS[s.provider]}
                    {s.provider === "upload" && ` · ${s.uploaded_file_name || "no file uploaded"}${s.uploaded_at ? ` (${fmtDate(s.uploaded_at)})` : ""}`}
                    {s.provider === "server_folder" && ` · ${s.config.root}/${s.config.path}`}
                    {s.provider === "graph_drive" && ` · ${s.config.display_path || s.config.item_path || "no file selected"}`}
                    {` · ${s.mapping_count} mapping(s)`}
                  </div>
                  <div className="small">
                    {s.last_check_ok === null ? <Badge>not checked</Badge> : <Badge tone={s.last_check_ok ? "good" : "critical"}>{s.last_check_ok ? "reachable" : "problem"}</Badge>}{" "}
                    <span className="muted">{s.last_check_message}</span>
                  </div>
                </div>
                <div className="row-actions">
                  <Button busy={busyId === s.id} onClick={() => void check(s)}>Check source</Button>
                  <Button variant="ghost" onClick={() => setEditing(s)}>{s.provider === "upload" ? "Edit / re-upload" : "Edit"}</Button>
                  <Button variant="ghost" className="danger-text" onClick={() => void remove(s)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      {editing && options.data && (
        <Modal title={editing.id ? "Edit data source" : "Add data source"} onClose={() => setEditing(null)}>
          <SourceForm initial={editing} options={options.data} onDone={() => { setEditing(null); refresh(); }} />
        </Modal>
      )}
    </Card>
  );
}
