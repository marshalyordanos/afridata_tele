import { useEffect, useState } from "react";
import {
  AgentsIcon,
  BellIcon,
  CloseIcon,
  DashboardIcon,
  LogoutIcon,
  MenuIcon,
  SettingsIcon,
  ShieldIcon,
  WalletIcon,
} from "./Icons";
import { initials } from "../lib/format";
import type { AdminProfile } from "../lib/session";

export type Route = "dashboard" | "agents" | "admins" | "wallet" | "settings";

type NavEntry = {
  route: Route;
  label: string;
  icon: (p: { className?: string }) => React.ReactElement;
  /** Entries marked super-admin-only are hidden from ordinary admins. */
  superAdminOnly?: boolean;
};

const NAV: NavEntry[] = [
  { route: "dashboard", label: "Dashboard", icon: DashboardIcon },
  { route: "agents", label: "Agents", icon: AgentsIcon },
  { route: "admins", label: "Console users", icon: ShieldIcon, superAdminOnly: true },
  { route: "wallet", label: "Wallet", icon: WalletIcon },
  { route: "settings", label: "Settings", icon: SettingsIcon },
];

type LayoutProps = {
  route: Route;
  onNavigate: (route: Route) => void;
  title: string;
  subtitle: string;
  me: AdminProfile;
  onLogout: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function Layout({
  route,
  onNavigate,
  title,
  subtitle,
  me,
  onLogout,
  actions,
  children,
}: LayoutProps) {
  // On phones the sidebar slides over the content instead of sitting beside it.
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [route]);

  return (
    <div className="shell">
      <aside className={`sidebar${drawerOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <span className="sidebar__mark">A</span>
          <span className="sidebar__wordmark">
            Afridata
            <small>Admin console</small>
          </span>
          <button
            type="button"
            className="icon-button sidebar__close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          >
            <CloseIcon className="icon" />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Main">
          <p className="sidebar__section">Manage</p>
          {NAV.filter((entry) => !entry.superAdminOnly || me.role === "SUPER_ADMIN").map(
            ({ route: target, label, icon: Icon }) => (
              <button
                key={target}
                type="button"
                className={`nav-item${route === target ? " nav-item--active" : ""}`}
                onClick={() => onNavigate(target)}
                aria-current={route === target ? "page" : undefined}
              >
                <Icon className="icon" />
                {label}
              </button>
            ),
          )}
        </nav>

        <div className="sidebar__footer">
          <div className="avatar avatar--brand">{initials(me.name)}</div>
          <div className="sidebar__user">
            <strong>{me.name}</strong>
            <small>{me.role === "SUPER_ADMIN" ? "Super admin" : "Admin"}</small>
          </div>
          <button
            type="button"
            className="icon-button sidebar__logout"
            onClick={onLogout}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogoutIcon className="icon" />
          </button>
        </div>
      </aside>

      {drawerOpen && (
        <button
          type="button"
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button topbar__menu"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon className="icon" />
          </button>

          <div className="topbar__titles">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          <div className="topbar__actions">
            <button type="button" className="icon-button" aria-label="Notifications">
              <BellIcon className="icon" />
              <span className="icon-button__dot" />
            </button>
            {actions}
            <div className="topbar__divider" />
            <div className="topbar__me">
              <span className="avatar">{initials(me.name)}</span>
              <div className="topbar__me-text">
                <strong>{me.name}</strong>
                <small>{me.phone}</small>
              </div>
            </div>
            <button type="button" className="button button--ghost" onClick={onLogout}>
              <LogoutIcon className="icon" />
              Sign out
            </button>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
