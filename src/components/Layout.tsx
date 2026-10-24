import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, ApiError, listAll } from "../api/client";
import type { Dashboard, Permission } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { useLoad } from "../hooks/useLoad";
import { useFeedback } from "./feedback";
import { Button, Field, Modal, TextInput } from "./ui";

function Item({ to, children, end }: { to: string; children: ReactNode; end?: boolean }) {
  return <NavLink to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? "nav-active" : ""}`}>{children}</NavLink>;
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const { toast, fail } = useFeedback();
  const save = async () => {
    setBusy(true);
    try {
      await api("/auth/change-password/", { method: "POST", body: { current_password: current, new_password: next } });
      toast("Password changed.");
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors);
      fail(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Change password" onClose={onClose} width={440}>
      <Field label="Current password" error={errors.current_password}>{(id) => <TextInput id={id} type="password" value={current} onChange={setCurrent} autoComplete="current-password" />}</Field>
      <Field label="New password" error={errors.new_password} help="At least 10 characters; avoid common passwords.">{(id) => <TextInput id={id} type="password" value={next} onChange={setNext} autoComplete="new-password" />}</Field>
      <div className="modal-actions"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void save()}>Change</Button></div>
    </Modal>
  );
}

export default function Layout() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const dashboards = useLoad(() => (can("dashboards.view") ? listAll<Dashboard>("/dashboards/") : Promise.resolve([])), [user?.id]);
  const any = (...perms: Permission[]) => perms.some(can);

  return (
    <div className={`shell ${menuOpen ? "menu-open" : ""}`}>
      <header className="topbar">
        <button type="button" className="icon-btn menu-toggle" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
        <span className="brand"><span className="brand-mark small" aria-hidden>QA</span> QA Reminder System</span>
        <div className="topbar-user">
          <span className="small">{user?.name} {user?.role && <span className="muted">· {user.role}</span>}</span>
          <Button variant="ghost" onClick={() => setPwOpen(true)}>Password</Button>
          <Button variant="ghost" onClick={() => void logout().then(() => navigate("/login"))}>Sign out</Button>
        </div>
      </header>
      <nav className="sidebar" aria-label="Main" onClick={() => setMenuOpen(false)}>
        {can("dashboards.view") && (
          <div className="nav-group">
            <div className="nav-heading">Dashboards</div>
            {(dashboards.data ?? []).filter((d) => d.is_published || can("dashboards.manage")).map((d) => (
              <Item key={d.id} to={`/dashboards/${d.id}`}>{d.name}{!d.is_published && " (draft)"}</Item>
            ))}
            {dashboards.data?.length === 0 && <span className="nav-empty">No dashboards assigned</span>}
          </div>
        )}
        {can("records.view") && <div className="nav-group"><Item to="/records">Records</Item></div>}
        {any("admin.configure", "admin.users", "dashboards.manage") && (
          <div className="nav-group">
            <div className="nav-heading">Administration</div>
            {can("admin.configure") && <Item to="/admin/quick-start">Quick Start</Item>}
            {any("admin.configure", "admin.users", "dashboards.manage") && <Item to="/admin/setup">Advanced Setup</Item>}
          </div>
        )}
        {any("runs.view", "audit.view") && (
          <div className="nav-group">
            <div className="nav-heading">Operations</div>
            {can("runs.view") && <Item to="/operations/runs">Runs & deliveries</Item>}
            {can("runs.view") && <Item to="/operations/sync">Sync logs</Item>}
            {can("audit.view") && <Item to="/operations/audit">Audit trail</Item>}
          </div>
        )}
      </nav>
      <main className="content" id="main">
        <Outlet />
      </main>
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </div>
  );
}
