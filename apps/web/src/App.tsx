import { Activity, Check, CircleHelp, ClipboardCheck, Clock3, FileText, LayoutDashboard, Menu, Plus, Search, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
  { label: "Requests", key: "requests", tone: "requests", icon: ClipboardCheck },
  { label: "In Review", key: "inReview", tone: "review", icon: Clock3 },
  { label: "Overdue", key: "overdue", tone: "overdue", icon: TriangleAlert },
  { label: "System", key: "system", tone: "system", icon: Check }
] as const;

export function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => storedAuthSession());
  const [localSession, setLocalSession] = useState<AuthSession | null>(() => storedLocalSession());
  const [authReady, setAuthReady] = useState(!oidcEnabled());
  const [authError, setAuthError] = useState<string | null>(null);
  const [workflowMetrics, setWorkflowMetrics] = useState(() => summarizeWorkflowMetrics([]));
  const location = useLocation();
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
    if (!isOidcEnabled || !authReady || authSession || !canUseEvaluationMode) return;

    const url = new URL(window.location.href);
    const wantsReviewAccess = url.searchParams.get("review") === "1" || url.searchParams.get("evaluation") === "1";
    if (!wantsReviewAccess || url.searchParams.has("code")) return;

    url.searchParams.delete("review");
    url.searchParams.delete("evaluation");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    startEvaluation();
  }, [authReady, authSession, canUseEvaluationMode, isOidcEnabled, startEvaluation]);

  const sessionSummaryText = activeSession
    ? isEvaluationMode
      ? "Read-only evaluation workspace"
      : `${permissionCount} permissions · expires ${new Date(activeSession.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    : "";

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
                  <span>{roleSelectLabel}</span>
                  <select value={actor.role} disabled={Boolean(authSession) || !activeSession} onChange={(event) => changeRole(event.target.value as Actor["role"])}>
                    <option value="inspector">Inspector</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              </div>
              <div className="topbar-metrics" aria-label="Workflow health">
                {topbarMetrics.map(({ label, key, tone, icon: Icon }) => (
                  <div key={label} className={`topbar-metric metric-${tone}`}>
                    <span className="metric-icon" aria-hidden="true">
                      <Icon size={14} strokeWidth={2.6} />
                    </span>
                    <span className="metric-label">{label}</span>
                    <strong>{String(workflowMetrics[key])}</strong>
                  </div>
                ))}
              </div>
              <div className="topbar-user">
                <CircleHelp size={17} />
                <span className="user-avatar">{userInitials}</span>
                <span className="session-summary">
                  <strong>{actor.name}</strong>
                  <small>{sessionSummaryText}</small>
                </span>
                <button className="text-button" onClick={logOut}>Sign out</button>
              </div>
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
            <span className="auth-brand">InspectIQ</span>
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
          <span className="auth-brand">InspectIQ</span>
          <span className="auth-kicker">Vehicle inspection workspace</span>
          <h1>Review the system without a login.</h1>
          <p>Open a read-only workspace to review inspection queues, reports, audit history, and operations health, or sign in with Cognito for secured workflow actions.</p>
          <div className="auth-trust-strip" aria-label="Access modes">
            <span>No credentials needed</span>
            <span>Read-only inspection data</span>
            <span>Cognito full access</span>
          </div>
        </div>

        <div className="auth-mode-grid">
          {props.authError ? <div className="form-error">{props.authError}</div> : null}
          {props.canUseEvaluationMode ? (
            <article className="auth-access-card auth-access-primary">
              <div>
                <span className="auth-card-label">Fast review access</span>
                <h2>Read-only workspace</h2>
              </div>
              <p>Review inspection records, advisory findings, reports, audit events, and Platform Health without creating an account.</p>
              <small>Workflow-changing actions remain disabled.</small>
              <button className="primary-button auth-wide-button" onClick={props.onStartEvaluation}>
                Enter read-only workspace
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
        <span>InspectIQ Secure Workspace</span>
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
