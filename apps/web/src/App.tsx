import { Activity, Check, CircleHelp, ClipboardCheck, Clock3, FileText, LayoutDashboard, Menu, Plus, Search, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { canRole, type RoleAction } from "@inspectiq/shared";
import type { Actor } from "./types.js";

type ActorContextValue = {
  actor: Actor;
  setRole: (role: Actor["role"]) => void;
  can: (action: RoleAction) => boolean;
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
  { to: "/inspections", label: "Inspection", icon: Search },
  { to: "/suggestions", label: "Suggestions", icon: Sparkles },
  { to: "/damage", label: "Damage", icon: TriangleAlert },
  { to: "/reports", label: "Report", icon: FileText },
  { to: "/audit", label: "Audit", icon: ShieldCheck },
  { to: "/platform-health", label: "Platform Health", icon: Activity }
];

const topbarMetrics = [
  { label: "Requests", value: "12", tone: "requests", icon: ClipboardCheck },
  { label: "In Review", value: "7", tone: "review", icon: Clock3 },
  { label: "Overdue", value: "2", tone: "overdue", icon: TriangleAlert },
  { label: "System", value: "All good", tone: "system", icon: Check }
] as const;

export function App() {
  const [role, setRole] = useState<Actor["role"]>("inspector");
  const location = useLocation();
  const actor = useMemo<Actor>(() => ({
    id: `operator-${role}`,
    name: role === "reviewer" ? "Review Lead" : role === "admin" ? "Admin Operator" : "John Smith",
    role
  }), [role]);
  const can = useCallback((action: RoleAction) => canRole(role, action), [role]);
  const userInitials = actor.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

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
    <ActorContext.Provider value={{ actor, setRole, can }}>
      <div className="app-shell">
        <aside className="sidebar">
          <Link to="/" className="brand">
            <strong>InspectIQ</strong>
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
              {topbarMetrics.map(({ label, value, tone, icon: Icon }) => (
                <div key={label} className={`topbar-metric metric-${tone}`}>
                  <span className="metric-icon" aria-hidden="true">
                    <Icon size={14} strokeWidth={2.6} />
                  </span>
                  <span className="metric-label">{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="topbar-user">
              <CircleHelp size={17} />
              <span className="user-avatar">{userInitials}</span>
              <strong>{actor.name}</strong>
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </ActorContext.Provider>
  );
}
