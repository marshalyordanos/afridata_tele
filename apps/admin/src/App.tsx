import { useCallback, useEffect, useState } from "react";
import { Layout, type Route } from "./components/Layout";
import { AgentsPage } from "./pages/Agents";
import { AdminsPage } from "./pages/Admins";
import { DashboardPage } from "./pages/Dashboard";
import { LoginPage } from "./pages/Login";
import { Toast, type ToastMessage } from "./components/Toast";
import { PlusIcon } from "./components/Icons";
import { fetchAgentStats, fetchMe, logout, type AgentStats } from "./lib/api";
import {
  SESSION_EXPIRED,
  clearSession,
  getProfile,
  getToken,
  type AdminProfile,
} from "./lib/session";

const ROUTES: Route[] = ["dashboard", "agents", "admins", "wallet", "settings"];

const HEADINGS: Record<Route, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "How the agent network is doing today" },
  agents: { title: "Agent management", subtitle: "Register, review and update agents" },
  admins: { title: "Console users", subtitle: "Who can sign in to this console" },
  wallet: { title: "Wallet", subtitle: "Deposits and withdrawals" },
  settings: { title: "Settings", subtitle: "Console preferences" },
};

function routeFromHash(): Route {
  const value = window.location.hash.replace("#/", "") as Route;
  return ROUTES.includes(value) ? value : "dashboard";
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [me, setMe] = useState<AdminProfile | null>(getProfile);
  // Until the stored token is checked against the server, show nothing but a
  // splash — otherwise the login page flashes on every reload.
  const [checkingSession, setCheckingSession] = useState(Boolean(getToken()));
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [toast, setToast] = useState<ToastMessage>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  /** Any 401 from anywhere in the app lands here. */
  useEffect(() => {
    const onExpired = () => {
      setMe(null);
      setStats(null);
      setToast({ kind: "error", text: "Your session has expired. Please sign in again." });
    };
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired);
  }, []);

  // Confirm a stored token is still valid, and pick up any role change.
  useEffect(() => {
    if (!getToken()) {
      setCheckingSession(false);
      return;
    }

    fetchMe()
      .then(setMe)
      .catch(() => {
        clearSession();
        setMe(null);
      })
      .finally(() => setCheckingSession(false));
  }, []);

  const refreshStats = useCallback(() => {
    if (!getToken()) return;
    fetchAgentStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  useEffect(() => {
    if (me) refreshStats();
  }, [me, refreshStats]);

  const navigate = useCallback((next: Route) => {
    window.location.hash = `#/${next}`;
    setRoute(next);
    setFormOpen(false);
  }, []);

  async function handleLogout() {
    await logout();
    setMe(null);
    setStats(null);
    navigate("dashboard");
    setToast({ kind: "success", text: "You have been signed out." });
  }

  if (checkingSession) {
    return (
      <div className="splash">
        <span className="sidebar__mark">A</span>
        <p>Checking your session…</p>
      </div>
    );
  }

  if (!me) {
    return (
      <>
        <LoginPage
          onSignedIn={(admin) => {
            setMe(admin);
            setToast({ kind: "success", text: `Welcome back, ${admin.name}.` });
          }}
        />
        <Toast toast={toast} onDismiss={() => setToast(null)} />
      </>
    );
  }

  // An ordinary admin who lands on #/admins is sent back to the dashboard.
  const effectiveRoute: Route = route === "admins" && me.role !== "SUPER_ADMIN" ? "dashboard" : route;
  if (effectiveRoute !== route && window.location.hash !== `#/${effectiveRoute}`) {
    // Keep the URL honest about which page is actually showing.
    window.location.replace(`#/${effectiveRoute}`);
  }
  const heading = HEADINGS[effectiveRoute];

  const primaryAction =
    effectiveRoute === "agents" || effectiveRoute === "dashboard"
      ? { label: "Register agent", target: "agents" as Route }
      : effectiveRoute === "admins"
        ? { label: "Create user", target: "admins" as Route }
        : null;

  return (
    <>
      <Layout
        route={effectiveRoute}
        onNavigate={navigate}
        title={heading.title}
        subtitle={heading.subtitle}
        me={me}
        onLogout={() => void handleLogout()}
        actions={
          primaryAction ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                if (effectiveRoute !== primaryAction.target) navigate(primaryAction.target);
                setFormOpen(true);
              }}
            >
              <PlusIcon className="icon" />
              {primaryAction.label}
            </button>
          ) : null
        }
      >
        {effectiveRoute === "dashboard" && (
          <DashboardPage
            stats={stats}
            onRegister={() => {
              navigate("agents");
              setFormOpen(true);
            }}
          />
        )}

        {effectiveRoute === "agents" && (
          <AgentsPage
            formOpen={formOpen}
            onFormOpenChange={setFormOpen}
            onToast={setToast}
            onChanged={refreshStats}
          />
        )}

        {effectiveRoute === "admins" && (
          <AdminsPage
            me={me}
            formOpen={formOpen}
            onFormOpenChange={setFormOpen}
            onToast={setToast}
          />
        )}

        {(effectiveRoute === "wallet" || effectiveRoute === "settings") && (
          <section className="panel">
            <div className="state">
              <h3>{heading.title} is next up</h3>
              <p>This section is not built yet. Agent management is live under Agents.</p>
              <button
                type="button"
                className="button button--primary"
                onClick={() => navigate("agents")}
              >
                Go to agents
              </button>
            </div>
          </section>
        )}
      </Layout>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
