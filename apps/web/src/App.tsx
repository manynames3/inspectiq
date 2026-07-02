import { Activity, AlertTriangle, CarFront, CheckCircle2, CircleHelp, ClipboardList, FileText, LayoutDashboard, Menu, Plus, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import type { Actor } from "./types.js";

type ActorContextValue = {
  actor: Actor;
  setRole: (role: Actor["role"]) => void;
};

const ActorContext = createContext<ActorContextValue | null>(null);

export function useActor(): ActorContextValue {
  const context = useContext(ActorContext);
  if (!context) throw new Error("Actor context missing");
  return context;
}

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/new", label: "New Inspection", icon: Plus },
  { to: "/inspections", label: "Inspection", icon: CarFront },
  { to: "/suggestions", label: "Suggestions", icon: Sparkles },
  { to: "/damage", label: "Damage", icon: TriangleAlert },
  { to: "/reports", label: "Report", icon: FileText },
  { to: "/audit", label: "Audit", icon: ShieldCheck },
  { to: "/platform-health", label: "Platform Health", icon: Activity }
];

export function App() {
  const [role, setRole] = useState<Actor["role"]>("reviewer");
  const location = useLocation();
  const actor = useMemo<Actor>(() => ({
    id: `demo-${role}`,
    name: role === "reviewer" ? "Review Lead" : role === "admin" ? "Admin Operator" : "Demo Inspector",
    role
  }), [role]);

  const isActive = (label: string, to: string): boolean => {
    if (label === "Dashboard") return location.pathname === "/";
    if (label === "New Inspection") return location.pathname === "/new";
    if (label === "Inspection") return location.pathname.startsWith("/inspections");
    if (label === "Suggestions") return location.pathname === "/suggestions";
    if (label === "Damage") return location.pathname === "/damage";
    if (label === "Report") return location.pathname === "/reports";
    if (label === "Audit") return location.pathname === "/audit";
    if (label === "Platform Health") return location.pathname === "/platform-health";
    return false;
  };

  return (
    <ActorContext.Provider value={{ actor, setRole }}>
      <div className="app-shell">
        <aside className="sidebar">
          <Link to="/" className="brand">
            <span className="brand-mark">IQ</span>
            <span>
              <strong>InspectIQ</strong>
              <small>Inspection workflow</small>
            </span>
          </Link>
          <nav className="nav-list" aria-label="Main navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={`${item.label}-${item.to}`} to={item.to} className={isActive(item.label, item.to) ? "active" : ""}>
                  <Icon size={17} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="workspace">
          <header className="topbar">
            <div className="topbar-left">
              <button className="icon-button" aria-label="Toggle navigation">
                <Menu size={18} />
              </button>
              <label className="role-select">
                <span>Role</span>
                <select value={role} onChange={(event) => setRole(event.target.value as Actor["role"])}>
                  <option value="inspector">Inspector</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
            <div className="topbar-metrics" aria-label="Workflow health">
              <div><ClipboardList size={17} /><span>Requests</span><strong>12</strong></div>
              <div><Activity size={17} /><span>In Review</span><strong>7</strong></div>
              <div><AlertTriangle size={17} /><span>Overdue</span><strong>2</strong></div>
              <div><CheckCircle2 size={17} /><span>System</span><strong>All good</strong></div>
            </div>
            <div className="topbar-user">
              <CircleHelp size={17} />
              <span className="user-avatar">JS</span>
              <strong>{actor.name}</strong>
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </ActorContext.Provider>
  );
}
