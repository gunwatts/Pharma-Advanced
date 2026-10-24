import { useState } from "react";
import { api, listAll } from "../../api/client";
import { loadDepartments, loadUnits, toOptions } from "../../api/lookups";
import type { Dashboard, Role, Scope, User } from "../../api/types";
import { useFeedback } from "../../components/feedback";
import { ResourceManager } from "../../components/ResourceManager";
import { Badge, Button, Callout, Checkbox, Modal, Select } from "../../components/ui";
import { useLoad } from "../../hooks/useLoad";

function ScopeEditor({ user, onClose }: { user: User; onClose: () => void }) {
  const units = useLoad(loadUnits, []);
  const departments = useLoad(loadDepartments, []);
  const [all, setAll] = useState(user.all_data_scope);
  const [scopes, setScopes] = useState<Scope[]>(user.scopes);
  const [busy, setBusy] = useState(false);
  const { toast, fail } = useFeedback();
  const save = async () => {
    setBusy(true);
    try {
      await api(`/users/${user.id}/`, { method: "PATCH", body: { all_data_scope: all, scopes: scopes.map((s) => ({ unit: s.unit, department: s.department })) } });
      toast("Data scope updated.");
      onClose();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Data scope - ${user.username}`} onClose={onClose} width={640}>
      <Callout tone="info">Scope is enforced on the server for every list, detail, search, export, dashboard widget and drill-down. Users with no scope see no records.</Callout>
      <Checkbox checked={all} onChange={setAll} label="Can see all units and departments" />
      {!all && (
        <div className="stack">
          {scopes.map((s, i) => (
            <div className="condition-row" key={i}>
              <Select value={s.unit ?? ""} placeholder="Any unit" options={toOptions(units.data)} onChange={(v) => setScopes(scopes.map((x, j) => (j === i ? { ...x, unit: v ? Number(v) : null } : x)))} />
              <Select value={s.department ?? ""} placeholder="Any department" options={toOptions(departments.data)} onChange={(v) => setScopes(scopes.map((x, j) => (j === i ? { ...x, department: v ? Number(v) : null } : x)))} />
              <Button variant="ghost" onClick={() => setScopes(scopes.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
          <div><Button onClick={() => setScopes([...scopes, { unit: null, department: null }])}>Add unit/department access</Button></div>
        </div>
      )}
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void save()}>Save scope</Button></div>
    </Modal>
  );
}

function scopeText(u: User) {
  if (u.all_data_scope || u.is_superuser) return <Badge tone="info">all units & departments</Badge>;
  if (!u.scopes.length) return <Badge tone="warning">no access to records</Badge>;
  return u.scopes.map((s) => `${s.unit_name ?? "Any unit"} / ${s.department_name ?? "any dept"}`).join("; ");
}

export function UsersSection() {
  const roles = useLoad(() => listAll<Role>("/roles/"), []);
  const dashboards = useLoad(() => listAll<Dashboard>("/dashboards/").catch((): Dashboard[] => []), []);
  const permissions = useLoad(() => api<{ key: string; description: string }[]>("/roles/permissions/"), []);
  const [scopeUser, setScopeUser] = useState<User | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <div className="stack">
      <ResourceManager<User>
        title="Users" endpoint="/users/" deps={[version]}
        defaults={{ username: "", email: "", first_name: "", last_name: "", is_active: true, role: null, default_dashboard: null, password: "" }}
        columns={[{ key: "username", label: "Username" }, { key: "name", label: "Name", render: (u) => `${u.first_name} ${u.last_name}`.trim() },
          { key: "role_name", label: "Role", render: (u) => u.role_name ?? (u.is_superuser ? "Superuser" : <Badge tone="warning">none</Badge>) },
          { key: "scope", label: "Data scope", render: scopeText },
          { key: "is_active", label: "Status", render: (u) => <Badge tone={u.is_active ? "good" : "neutral"}>{u.is_active ? "active" : "disabled"}</Badge> }]}
        fields={[
          { key: "username", label: "Username", type: "text", required: true },
          { key: "email", label: "Email", type: "text" },
          { key: "first_name", label: "First name", type: "text" },
          { key: "last_name", label: "Last name", type: "text" },
          { key: "role", label: "Role", type: "select", options: toOptions(roles.data), numeric: true },
          { key: "default_dashboard", label: "Default dashboard (optional)", type: "select", options: toOptions(dashboards.data), numeric: true },
          { key: "password", label: "Password (leave blank to keep)", type: "password", help: "Min 10 characters. Setting it signs the user out of all sessions." },
          { key: "is_active", label: "Active", type: "checkbox" },
        ]}
        toPayload={(d) => {
          const { password, ...rest } = d;
          delete rest.scopes;
          return password ? { ...rest, password } : rest;
        }}
        rowActions={(u) => <Button onClick={() => setScopeUser(u)}>Data scope</Button>}
        itemLabel={(u) => u.username}
      />
      <ResourceManager<Role>
        title="Roles" endpoint="/roles/"
        description="Roles are sets of fixed permissions. Assign dashboards to roles in the dashboard builder."
        defaults={{ key: "", name: "", description: "", permissions: ["records.view", "dashboards.view"], default_dashboard: null }}
        columns={[{ key: "name", label: "Role" }, { key: "permissions", label: "Permissions", render: (r) => <span className="small">{r.permissions.join(", ")}</span> },
          { key: "user_count", label: "Users" }, { key: "is_system", label: "", render: (r) => (r.is_system ? <Badge>system</Badge> : null) }]}
        fields={[
          { key: "name", label: "Name", type: "text", required: true },
          { key: "key", label: "Key", type: "text", required: true, createOnly: true },
          { key: "description", label: "Description", type: "text" },
          { key: "permissions", label: "Permissions", type: "multiselect", options: (permissions.data ?? []).map((p) => ({ value: p.key, label: `${p.key} — ${p.description}` })) },
          { key: "default_dashboard", label: "Default dashboard for this role", type: "select", options: toOptions(dashboards.data), numeric: true },
        ]}
        canDelete
      />
      {scopeUser && <ScopeEditor user={scopeUser} onClose={() => { setScopeUser(null); setVersion((v) => v + 1); }} />}
    </div>
  );
}
