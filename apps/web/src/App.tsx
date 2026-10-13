import { Activity, ClipboardCheck, Clock3, FileText, LayoutDashboard, Menu, Plus, Search, ShieldCheck, Sparkles, TriangleAlert, Warehouse, Wrench, X, ChevronDown } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { canRole, rolePermissions, type RoleAction } from "@inspectiq/shared";
import { api } from "./api.js";
import {
  beginLogin,
  clearLocalSession,
  completeLoginFromCallback,
  evaluationModeEnabled,
  isEvaluationSession,
  oidcEnabled,
  saveAuthSession,
  signOut,
  startEvaluationSession,
  startLocalSession,
  storedAuthSession,
  storedLocalSession,
  type AuthSession
} from "./auth.js";
import type { Actor, Inspection } from "./types.js";
import { summarizeWorkflowMetrics } from "./workflowMetrics.js";
import { Brand } from "./components/Brand.js";

type ActorContextValue = {
  actor: Actor;
  setRole: (role: Actor["role"]) => void;
  can: (action: RoleAction) => boolean;
  isEvaluationMode: boolean;
};

const ActorContext = createContext<ActorContextValue | null>(null);

export function useActor(): ActorContextValue {
  const context = useContext(ActorContext);
  if (!context) throw new Error("Actor context missing");
  return context;
}

const navItems: Array<{ to: string; label: string; icon: typeof LayoutDashboard; roles?: Actor["role"][] }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/new", label: "New Inspection", icon: Plus, roles: ["inspector", "admin"] },
  { to: "/inspections", label: "Inspection", icon: Search, roles: ["inspector", "reviewer", "admin"] },
  { to: "/suggestions", label: "Suggestions", icon: Sparkles, roles: ["inspector", "reviewer", "admin"] },
  { to: "/damage", label: "Damage", icon: TriangleAlert, roles: ["reviewer", "recon_coordinator", "admin"] },
  { to: "/reports", label: "Report", icon: FileText, roles: ["reviewer", "recon_coordinator", "consignor_approver", "admin"] },
  { to: "/operations", label: "Recon Operations", icon: Warehouse, roles: ["reviewer", "recon_coordinator", "consignor_approver", "technician", "admin"] },
  { to: "/shop", label: "Shop Board", icon: Wrench, roles: ["recon_coordinator", "technician", "admin"] },
  { to: "/audit", label: "Audit", icon: ShieldCheck },
  { to: "/platform-health", label: "Platform Health", icon: Activity, roles: ["admin"] }
];

const topbarMetrics = [
  { label: "Vehicles", key: "requests", tone: "requests", icon: ClipboardCheck },
  { label: "In Review", key: "inReview", tone: "review", icon: Clock3 },
  { label: "Needs attention", key: "overdue", tone: "overdue", icon: TriangleAlert }
] as const;

export function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => storedAuthSession());
  const [localSession, setLocalSession] = useState<AuthSession | null>(() => storedLocalSession());
  const [authReady, setAuthReady] = useState(!oidcEnabled());
  const [authError, setAuthError] = useState<string | null>(null);
  const [workflowMetrics, setWorkflowMetrics] = useState(() => summarizeWorkflowMetrics([]));
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => { setNavigationOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!navigationOpen) return;
    const trigger = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => Array.from(sidebar.current?.querySelectorAll<HTMLElement>("a, button") ?? []);
    controls()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setNavigationOpen(false); }
      if (event.key !== "Tab") return;
      const items = controls();
      const next = event.shiftKey ? items.at(-1) : items[0];
      if (document.activeElement === (event.shiftKey ? items[0] : items.at(-1))) { event.preventDefault(); next?.focus(); }
    };
    const onResize = () => { if (window.innerWidth > 900) setNavigationOpen(false); };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); if (trigger?.isConnected) trigger.focus(); };
  }, [navigationOpen]);
  const isOidcEnabled = oidcEnabled();
  const canUseEvaluationMode = evaluationModeEnabled();
  const effectiveLocalSession = !isOidcEnabled || isEvaluationSession(localSession) ? localSession : null;
  const activeSession = authSession ?? effectiveLocalSession;
  const isEvaluationMode = isEvaluationSession(activeSession);
  const actor = activeSession?.actor ?? { id: "signed-out", name: "Signed Out", role: "inspector" as const };
  const can = useCallback((action: RoleAction) => !isEvaluationMode && canRole(actor.role, action), [actor.role, isEvaluationMode]);
  const userInitials = actor.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const permissionCount = rolePermissions[actor.role].length;
  const roleSelectLabel = authSession ? "OIDC role" : isEvaluationMode ? "Evaluation role" : "Session profile";

  useEffect(() => {
    if (!activeSession) {
      setWorkflowMetrics(summarizeWorkflowMetrics([]));
      return;
    }

    let cancelled = false;
    api<Inspection[]>("/api/inspections", {}, actor)
      .then((inspections) => {
        if (!cancelled) setWorkflowMetrics(summarizeWorkflowMetrics(inspections));
      })
      .catch(() => {
        if (!cancelled) setWorkflowMetrics(summarizeWorkflowMetrics([]));
      });

    return () => {
      cancelled = true;
    };
  }, [activeSession?.actor.id, actor.role, location.pathname]);

  useEffect(() => {
    if (!isOidcEnabled) return;
    let cancelled = false;
    completeLoginFromCallback()
      .then((session) => {
        if (cancelled) return;
        setAuthSession(session);
        setAuthReady(true);
        setAuthError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setAuthError(error instanceof Error ? error.message : "Sign-in failed.");
        setAuthReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOidcEnabled]);

  useEffect(() => {
    if (!isOidcEnabled || !authReady || !authSession) return;
    let cancelled = false;

    api<{ actor: Actor }>("/api/auth/session", {}, authSession.actor)
      .then((session) => {
        if (cancelled) return;
        setAuthSession((current) => {
          if (!current) return current;
          if (current.actor.id === session.actor.id && current.actor.role === session.actor.role && current.actor.name === session.actor.name) return current;

          const next = { ...current, actor: session.actor };
          saveAuthSession(next);
          return next;
        });
        setAuthError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setAuthError(error instanceof Error ? error.message : "Could not confirm session permissions.");
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, authSession?.idToken, isOidcEnabled]);

  const changeRole = useCallback((nextRole: Actor["role"]) => {
    if (authSession) return;
    if (isEvaluationMode) {
      setLocalSession(startEvaluationSession(nextRole));
      return;
    }
    if (!isOidcEnabled) setLocalSession(startLocalSession(nextRole));
  }, [authSession, isEvaluationMode, isOidcEnabled]);

  const logOut = useCallback(() => {
    setAuthSession(null);
    setLocalSession(null);
    if (authSession) signOut();
    else clearLocalSession();
  }, [authSession]);

  const startEvaluation = useCallback(() => {
    setAuthError(null);
    setAuthSession(null);
    setLocalSession(startEvaluationSession("admin"));
  }, []);

  useEffect(() => {
    if (!authReady || authSession || !canUseEvaluationMode) return;

    const url = new URL(window.location.href);
    const wantsReviewAccess = url.searchParams.get("review") === "1" || url.searchParams.get("evaluation") === "1";
    if (!wantsReviewAccess || url.searchParams.has("code")) return;

    url.searchParams.delete("review");
    url.searchParams.delete("evaluation");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    startEvaluation();
  }, [authReady, authSession, canUseEvaluationMode, startEvaluation]);

  const sessionSummaryText = activeSession
    ? isEvaluationMode
      ? "Evaluation workspace · session-only changes"
      : `${permissionCount} permissions · expires ${new Date(activeSession.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "";

  const isActive = (label: string, to: string): boolean => {
    if (label === "Dashboard") return location.pathname === "/";
    if (label === "New Inspection") return location.pathname === "/new";
    if (label === "Inspection") return location.pathname.startsWith("/inspections");
    if (label === "Suggestions") return location.pathname === "/suggestions";
    if (label === "Damage") return location.pathname === "/damage";
    if (label === "Report") return location.pathname === "/reports";
    if (label === "Recon Operations") return location.pathname.startsWith("/operations");
    if (label === "Shop Board") return location.pathname === "/shop";
    if (label === "Audit") return location.pathname === "/audit";
    if (label === "Platform Health") return location.pathname === "/platform-health";
    return false;
  };

  const authContent = isOidcEnabled && !authReady ? (
    <OidcAuthGate state="loading" />
  ) : isOidcEnabled && !authSession && !effectiveLocalSession ? (
    <OidcAuthGate
      state="signed-out"
      authError={authError}
      canUseEvaluationMode={canUseEvaluationMode}
      onStartEvaluation={startEvaluation}
      onBeginLogin={() => void beginLogin()}
    />
  ) : !isOidcEnabled && !effectiveLocalSession ? (
    <LocalSessionGate onStart={(nextRole) => setLocalSession(startLocalSession(nextRole))} />
  ) : null;

  return (
    <ActorContext.Provider value={{ actor, setRole: changeRole, can, isEvaluationMode }}>
      {authContent ?? (
        <div className={`app-shell supreme-shell ${navigationOpen ? "navigation-open" : ""}`}>
          <a className="skip-link" href="#main-workspace">Skip to workspace</a>
          {navigationOpen ? <button className="navigation-scrim" aria-label="Close navigation" tabIndex={-1} onClick={() => setNavigationOpen(false)} /> : null}
          <aside ref={sidebar} className="sidebar" id="main-navigation" role={navigationOpen ? "dialog" : undefined} aria-modal={navigationOpen || undefined} aria-label={navigationOpen ? "Workspace navigation" : undefined}>
            <button className="icon-button sidebar-close" aria-label="Close navigation panel" onClick={() => setNavigationOpen(false)}><X size={18} /></button>
            <Link to="/" className="brand">
              <Brand />
            </Link>
            <nav className="nav-list" aria-label="Main navigation">
              {(["Work", "Records", "Operations", "Administration"] as const).map((group) => {
                const items = navItems.filter((item) => !item.roles || item.roles.includes(actor.role)).filter((item) => {
                  const itemGroup = ["/operations", "/shop"].includes(item.to) ? "Operations" : ["/audit", "/platform-health"].includes(item.to) ? "Administration" : ["/damage", "/reports"].includes(item.to) ? "Records" : "Work";
                  return itemGroup === group;
                });
                return items.length ? <div className="nav-group" key={group}><span className="nav-group-label">{group}</span>{items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={`${item.label}-${item.to}`} to={item.to} aria-current={isActive(item.label, item.to) ? "page" : undefined} className={isActive(item.label, item.to) ? "active" : ""}>
                    <Icon size={17} aria-hidden="true" />
                    <span>{item.to === "/" ? "Work queue" : item.to === "/suggestions" ? "Finding review" : item.to === "/reports" ? "Reports" : item.label}</span>
                  </Link>
                );
                })}</div> : null;
              })}
            </nav>
            <div className="sidebar-foot"><span className="brand-seam" />Evidence. Decisions. Accountability.<small>Vehicle condition intelligence</small></div>
          </aside>
          <main className="workspace" id="main-workspace" tabIndex={-1} inert={navigationOpen}>
            <header className="topbar">
              <div className="topbar-left">
                <button className="icon-button navigation-toggle" aria-label="Toggle navigation" aria-expanded={navigationOpen} aria-controls="main-navigation" onClick={() => setNavigationOpen((open) => !open)}>
                  {navigationOpen ? <X size={18} /> : <Menu size={18} />}
                </button>
                <span className="workspace-label">{isEvaluationMode ? "Evaluation workspace" : "Operations workspace"}<small>{actor.role.replaceAll("_", " ")}</small></span>
              </div>
              <div className="topbar-metrics" aria-label="Workflow health">
                {topbarMetrics.map(({ label, key, tone, icon: Icon }) => (
                  <div key={label} className={`topbar-metric metric-${tone}`}>
                    <Icon size={14} aria-hidden="true" />
                    <strong>{String(workflowMetrics[key])}</strong><span>{label}</span>
                  </div>
                ))}
              </div>
              <details className="account-menu" onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
                <summary><span className="user-avatar">{userInitials}</span><span>{actor.name}</span><ChevronDown size={14} /></summary>
                <div className="account-menu-panel">
                <p>{sessionSummaryText}</p>
                <label className="role-select">
                  <span>{roleSelectLabel}</span>
                  <select value={actor.role} disabled={Boolean(authSession) || !activeSession} onChange={(event) => changeRole(event.target.value as Actor["role"])}>
                    <option value="inspector">Inspector</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="recon_coordinator">Recon Coordinator</option>
                    <option value="consignor_approver">Consignor Approver</option>
                    <option value="technician">Technician</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <button className="text-button" onClick={logOut}>Sign out</button>
                </div>
              </details>
            </header>
            <Outlet />
          </main>
        </div>
      )}
    </ActorContext.Provider>
  );
}

type OidcAuthGateProps =
  | { state: "loading" }
  | {
      state: "signed-out";
      authError: string | null;
      canUseEvaluationMode: boolean;
      onStartEvaluation: () => void;
      onBeginLogin: () => void;
    };

function OidcAuthGate(props: OidcAuthGateProps) {
  if (props.state === "loading") {
    return (
      <section className="auth-page">
        <div className="auth-panel auth-panel-single">
          <div className="auth-copy">
            <span className="auth-brand"><Brand /></span>
            <span className="auth-kicker">Secure workspace</span>
            <h1>Signing in</h1>
            <p>Completing Cognito authorization and loading role-aware workspace access.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-page">
      <div className="auth-panel">
        <div className="auth-copy">
          <span className="auth-brand"><Brand /></span>
          <span className="auth-kicker">Vehicle inspection workspace</span>
          <h1>Review the system without a login.</h1>
          <p>Explore inspection queues, reports, audit history, and operations health. Reviewer decisions and manual damage entries stay isolated to your browser session.</p>
          <div className="auth-trust-strip" aria-label="Access modes">
            <span>No credentials needed</span>
            <span>Session-only review actions</span>
            <span>Cognito full access</span>
          </div>
        </div>

        <div className="auth-mode-grid">
          {props.authError ? <div className="form-error">{props.authError}</div> : null}
          {props.canUseEvaluationMode ? (
            <article className="auth-access-card auth-access-primary">
              <div>
                <span className="auth-card-label">Fast review access</span>
                <h2>Evaluation workspace</h2>
              </div>
              <p>Review records and try Reviewer/Admin decisions without creating an account.</p>
              <small>Session changes reset without modifying production records.</small>
              <button className="primary-button auth-wide-button" onClick={props.onStartEvaluation}>
                Open evaluation workspace
              </button>
            </article>
          ) : null}

          <article className="auth-access-card">
            <div>
              <span className="auth-card-label">Enterprise path</span>
              <h2>Cognito sign-in</h2>
            </div>
            <p>Use the protected login for JWT role claims, object-level access, and full workflow actions.</p>
            <small>Best for reviewers with issued credentials.</small>
            <button className={props.canUseEvaluationMode ? "secondary-button auth-wide-button" : "primary-button auth-wide-button"} onClick={props.onBeginLogin}>
              Sign in with Cognito
            </button>
          </article>
        </div>
      </div>
    </section>
  );
}

function LocalSessionGate({ onStart }: { onStart: (role: Actor["role"]) => void }) {
  const profiles: Array<{
    role: Actor["role"];
    title: string;
    name: string;
    scope: string;
    work: string;
  }> = [
    {
      role: "inspector",
      title: "Inspector",
      name: "John Smith",
      scope: "Assigned offsite inspections",
      work: "Capture required evidence, submit retakes, and start image analysis."
    },
    {
      role: "reviewer",
      title: "Reviewer",
      name: "Review Lead",
      scope: "Human review queue",
      work: "Resolve AI suggestions, confirm damage, grade, draft, and finalize reports."
    },
    {
      role: "recon_coordinator",
      title: "Recon Coordinator",
      name: "Alex Rivera",
      scope: "Authorization and shop coordination",
      work: "Prepare estimates, route approvals, manage work orders, and verify sale readiness."
    },
    {
      role: "consignor_approver",
      title: "Consignor Approver",
      name: "Morgan Ellis",
      scope: "Authorized consignor accounts",
      work: "Approve, decline, or request revision of recon spending before work begins."
    },
    {
      role: "technician",
      title: "Technician",
      name: "Sam Patel",
      scope: "Assigned facility work",
      work: "Start assigned work, report blockers, revise estimates, and send completed tasks to QC."
    },
    {
      role: "admin",
      title: "Admin",
      name: "Admin Operator",
      scope: "Operations exception access",
      work: "Monitor SLOs, recover failed jobs, and correct workflow exceptions."
    }
  ];

  return (
    <section className="auth-gate enterprise-auth">
      <div className="auth-hero-copy">
        <div className="auth-hero-brand"><Brand /></div>
        <span className="eyebrow">InspectIQ Secure Workspace</span>
        <h1>Vehicle inspection operations</h1>
        <p>Enter with a role-scoped enterprise session. Production deployments use OIDC/JWT claims; local sessions preserve the same RBAC and object-access behavior for review and testing.</p>
      </div>
      <div className="session-card-grid" aria-label="Workspace sessions">
        {profiles.map((profile) => (
          <article className={`session-card session-${profile.role}`} key={profile.role}>
            <div>
              <strong>{profile.title}</strong>
              <span>{profile.name}</span>
            </div>
            <p>{profile.work}</p>
            <small>{profile.scope}</small>
            <button className="primary-button" onClick={() => onStart(profile.role)}>
              Start {profile.title} Session
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
