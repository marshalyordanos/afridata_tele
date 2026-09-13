import { useEffect, useState } from "react";
import { listAgents, type Agent, type AgentStats } from "../lib/api";
import { birr, initials, prettyPhone, shortDate } from "../lib/format";
import { StatusBadge } from "../components/StatusBadge";
import { CheckIcon, ClockIcon, PauseIcon, UsersIcon, WalletIcon } from "../components/Icons";

type StatCard = {
  label: string;
  value: string;
  hint: string;
  tone: "brand" | "success" | "warn" | "danger";
  icon: (p: { className?: string }) => React.ReactElement;
};

function cards(stats: AgentStats | null): StatCard[] {
  return [
    {
      label: "Total agents",
      value: stats ? String(stats.total) : "—",
      hint: "Registered on the network",
      tone: "brand",
      icon: UsersIcon,
    },
    {
      label: "Active",
      value: stats ? String(stats.byStatus.ACTIVE) : "—",
      hint: "Trading right now",
      tone: "success",
      icon: CheckIcon,
    },
    {
      label: "Pending approval",
      value: stats ? String(stats.byStatus.PENDING) : "—",
      hint: "Waiting on review",
      tone: "warn",
      icon: ClockIcon,
    },
    {
      label: "Suspended",
      value: stats ? String(stats.byStatus.SUSPENDED) : "—",
      hint: "Blocked from trading",
      tone: "danger",
      icon: PauseIcon,
    },
  ];
}

export function DashboardPage({
  stats,
  onRegister,
}: {
  stats: AgentStats | null;
  onRegister: () => void;
}) {
  const [recent, setRecent] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAgents({ page: 1, pageSize: 5, sortBy: "createdAt", sortDir: "desc" })
      .then((result) => setRecent(result.items))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false));
  }, [stats]);

  return (
    <>
      <div className="stat-grid">
        {cards(stats).map((card) => (
          <article key={card.label} className={`stat stat--${card.tone}`}>
            <span className="stat__icon">
              <card.icon className="icon" />
            </span>
            <div>
              <p className="stat__label">{card.label}</p>
              <p className="stat__value">{card.value}</p>
              <p className="stat__hint">{card.hint}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2>Recently registered</h2>
              <p>The five newest agents on the network</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th className="is-right">Float</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 5 }, (_, index) => (
                    <tr key={index}>
                      {Array.from({ length: 5 }, (_, cell) => (
                        <td key={cell}>
                          <span className="skeleton" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {!loading &&
                  recent.map((agent) => (
                    <tr key={agent.id}>
                      <td>
                        <div className="cell-agent">
                          <span className="avatar">{initials(agent.fullName)}</span>
                          <div>
                            <strong>{agent.fullName}</strong>
                            <small>{agent.businessName ?? "No business name"}</small>
                          </div>
                        </div>
                      </td>
                      <td className="cell-mono">{prettyPhone(agent.phone)}</td>
                      <td>
                        <StatusBadge status={agent.status} />
                      </td>
                      <td className="is-right cell-mono">{birr(agent.balance)}</td>
                      <td className="muted">{shortDate(agent.createdAt)}</td>
                    </tr>
                  ))}

                {!loading && recent.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <div className="state">
                        <h3>Nothing here yet</h3>
                        <p>Register an agent to get started.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel panel--aside">
          <div className="panel__head">
            <div>
              <h2>Network float</h2>
              <p>Balance held by all agents</p>
            </div>
          </div>

          <div className="float-card">
            <span className="float-card__icon">
              <WalletIcon className="icon" />
            </span>
            <p className="float-card__value">{stats ? birr(stats.totalBalance) : "—"}</p>
            <p className="float-card__unit">Ethiopian Birr</p>
          </div>

          <div className="quick">
            <h3>Quick actions</h3>
            <button type="button" className="button button--primary" onClick={onRegister}>
              Register a new agent
            </button>
            <p className="quick__note">
              Phone numbers are stored as <code>+251986680094</code>. Local forms such as
              <code>0986680094</code> are converted automatically.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
