import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAgent,
  deleteAgent,
  listAgents,
  updateAgent,
  type Agent,
  type AgentInput,
  type AgentListParams,
  type AgentStatus,
  type Paginated,
} from "../lib/api";
import { birr, initials, prettyPhone, shortDate } from "../lib/format";
import { AgentForm } from "../components/AgentForm";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { StatusBadge } from "../components/StatusBadge";
import { CheckIcon, EditIcon, PauseIcon, SearchIcon, TrashIcon } from "../components/Icons";
import type { ToastMessage } from "../components/Toast";

type SortKey = AgentListParams["sortBy"];

const FILTERS: { value: AgentStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING", label: "Pending" },
  { value: "SUSPENDED", label: "Suspended" },
];

const COLUMNS: { key: SortKey | null; label: string; align?: "right" }[] = [
  { key: "fullName", label: "Agent" },
  { key: null, label: "Phone" },
  { key: null, label: "Telebirr PIN" },
  { key: null, label: "Location" },
  { key: "status", label: "Status" },
  { key: "balance", label: "Float balance", align: "right" },
  { key: "createdAt", label: "Registered" },
  { key: null, label: "" },
];

/**
 * The one status move that makes sense for a row: a pending or suspended agent
 * is approved into ACTIVE, an active one is suspended.
 */
const STATUS_ACTION = {
  ACTIVE: {
    next: "SUSPENDED" as AgentStatus,
    verb: "Suspend",
    icon: PauseIcon,
    className: "icon-button icon-button--warn",
    title: "Suspend agent",
    confirm: "will be blocked from trading until they are approved again.",
    button: "button button--danger",
  },
  PENDING: {
    next: "ACTIVE" as AgentStatus,
    verb: "Approve",
    icon: CheckIcon,
    className: "icon-button icon-button--success",
    title: "Approve agent",
    confirm: "will be marked active and can start trading straight away.",
    button: "button button--primary",
  },
  SUSPENDED: {
    next: "ACTIVE" as AgentStatus,
    verb: "Reactivate",
    icon: CheckIcon,
    className: "icon-button icon-button--success",
    title: "Reactivate agent",
    confirm: "will be active again and able to trade.",
    button: "button button--primary",
  },
} satisfies Record<AgentStatus, unknown>;

/** Waits for typing to settle before the list refetches. */
function useDebounced<T>(value: T, delay = 350) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

type AgentsPageProps = {
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
  onToast: (toast: ToastMessage) => void;
  onChanged: () => void;
};

export function AgentsPage({ formOpen, onFormOpenChange, onToast, onChanged }: AgentsPageProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AgentStatus | "">("");
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [data, setData] = useState<Paginated<Agent> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState<Agent | null>(null);
  // PINs stay masked until someone asks for one, per row.
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<Agent | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);

  const debouncedSearch = useDebounced(search);
  // A stale response from a slower earlier request must not overwrite a newer one.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await listAgents({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        status,
        sortBy,
        sortDir,
      });
      if (id !== requestId.current) return;
      setData(result);
      setError("");
    } catch (caught) {
      if (id !== requestId.current) return;
      setError((caught as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [page, pageSize, debouncedSearch, status, sortBy, sortDir]);

  useEffect(() => {
    void load();
  }, [load]);

  // Any change to what is being filtered puts you back on the first page.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, pageSize]);

  /** A page can empty out after a delete; step back rather than show nothing. */
  useEffect(() => {
    if (data && page > data.pageCount) setPage(data.pageCount);
  }, [data, page]);

  const rows = data?.items ?? [];
  const showSkeleton = loading && !data;

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "fullName" ? "asc" : "desc");
    }
  }

  async function handleSubmit(input: AgentInput) {
    if (editing) {
      await updateAgent(editing.id, input);
      onToast({ kind: "success", text: `${input.fullName} updated.` });
    } else {
      await createAgent(input);
      onToast({ kind: "success", text: `${input.fullName} registered as an agent.` });
    }
    closeForm();
    await load();
    onChanged();
  }

  function closeForm() {
    setEditing(null);
    onFormOpenChange(false);
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    const action = STATUS_ACTION[pendingStatus.status];

    setChangingStatus(true);
    try {
      await updateAgent(pendingStatus.id, { status: action.next });
      onToast({
        kind: "success",
        text: `${pendingStatus.fullName} is now ${action.next === "ACTIVE" ? "active" : "suspended"}.`,
      });
      setPendingStatus(null);
      await load();
      onChanged();
    } catch (caught) {
      onToast({ kind: "error", text: (caught as Error).message });
    } finally {
      setChangingStatus(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteAgent(pendingDelete.id);
      onToast({ kind: "success", text: `${pendingDelete.fullName} removed.` });
      setPendingDelete(null);
      await load();
      onChanged();
    } catch (caught) {
      onToast({ kind: "error", text: (caught as Error).message });
    } finally {
      setDeleting(false);
    }
  }

  const activeFilterLabel = useMemo(
    () => FILTERS.find((filter) => filter.value === status)?.label ?? "All",
    [status],
  );

  return (
    <>
      <section className="panel">
        <div className="panel__head">
          <div>
            <h2>Agents</h2>
            <p>
              {activeFilterLabel} agents
              {debouncedSearch ? ` matching “${debouncedSearch}”` : ""} · {data?.total ?? 0} total
            </p>
          </div>

          <div className="toolbar">
            <div className="search">
              <SearchIcon className="icon search__icon" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, phone, city…"
                aria-label="Search agents"
              />
            </div>

            <div className="segmented" role="group" aria-label="Filter by status">
              {FILTERS.map((filter) => (
                <button
                  key={filter.label}
                  type="button"
                  className={`segmented__item${status === filter.value ? " segmented__item--active" : ""}`}
                  onClick={() => setStatus(filter.value)}
                  aria-pressed={status === filter.value}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <div className="state state--error">
            <p>{error}</p>
            <button type="button" className="button button--ghost" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table--wide">
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.label || "actions"}
                      className={column.align === "right" ? "is-right" : undefined}
                      aria-sort={
                        column.key && sortBy === column.key
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      {column.key ? (
                        <button
                          type="button"
                          className={`th-sort${sortBy === column.key ? " th-sort--active" : ""}`}
                          onClick={() => toggleSort(column.key as SortKey)}
                        >
                          {column.label}
                          <span className="th-sort__arrow">
                            {sortBy === column.key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </button>
                      ) : (
                        column.label || <span className="sr-only-label">Actions</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className={loading && data ? "is-refreshing" : undefined}>
                {showSkeleton &&
                  Array.from({ length: pageSize }, (_, index) => (
                    <tr key={`skeleton-${index}`}>
                      {COLUMNS.map((column) => (
                        <td key={column.label || "actions"}>
                          <span className="skeleton" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {!showSkeleton &&
                  rows.map((agent) => (
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
                        {agent.pin ? (
                          <span className="pin">
                            <span className="pin__value">
                              {revealed.has(agent.id) ? agent.pin : "••••••"}
                            </span>
                            <button
                              type="button"
                              className="pin__toggle"
                              onClick={() =>
                                setRevealed((current) => {
                                  const next = new Set(current);
                                  if (next.has(agent.id)) next.delete(agent.id);
                                  else next.add(agent.id);
                                  return next;
                                })
                              }
                            >
                              {revealed.has(agent.id) ? "Hide" : "Show"}
                            </button>
                          </span>
                        ) : (
                          <span className="muted">Not set</span>
                        )}
                      </td>
                      <td>
                        {agent.city || agent.region ? (
                          <div className="cell-stack">
                            <span>{agent.city ?? "—"}</span>
                            <small>{agent.region ?? ""}</small>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={agent.status} />
                      </td>
                      <td className="is-right cell-mono">
                        <div className="cell-stack">
                          <span>{birr(agent.balance)}</span>
                          <small>{agent.commissionRate}% commission</small>
                        </div>
                      </td>
                      <td className="muted">{shortDate(agent.createdAt)}</td>
                      <td>
                        <div className="row-actions">
                          {(() => {
                            const action = STATUS_ACTION[agent.status];
                            const ActionIcon = action.icon;
                            return (
                              <button
                                type="button"
                                className={action.className}
                                onClick={() => setPendingStatus(agent)}
                                aria-label={`${action.verb} ${agent.fullName}`}
                                title={action.title}
                              >
                                <ActionIcon className="icon" />
                              </button>
                            );
                          })()}
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => {
                              setEditing(agent);
                              onFormOpenChange(true);
                            }}
                            aria-label={`Edit ${agent.fullName}`}
                          >
                            <EditIcon className="icon" />
                          </button>
                          <button
                            type="button"
                            className="icon-button icon-button--danger"
                            onClick={() => setPendingDelete(agent)}
                            aria-label={`Delete ${agent.fullName}`}
                          >
                            <TrashIcon className="icon" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                {!showSkeleton && rows.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length}>
                      <div className="state">
                        <h3>No agents found</h3>
                        <p>
                          {debouncedSearch || status
                            ? "Try a different search term or clear the status filter."
                            : "Register your first agent to see them listed here."}
                        </p>
                        <button
                          type="button"
                          className="button button--primary"
                          onClick={() => onFormOpenChange(true)}
                        >
                          Register agent
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && !error && (
          <Pagination
            page={data.page}
            pageCount={data.pageCount}
            pageSize={data.pageSize}
            total={data.total}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        )}
      </section>

      {formOpen && (
        <Modal
          title={editing ? "Edit agent" : "Register agent"}
          description={
            editing
              ? "Update this agent's details and float balance."
              : "Add a new cash-in/cash-out agent to the network."
          }
          onClose={closeForm}
        >
          <AgentForm agent={editing} onSubmit={handleSubmit} onCancel={closeForm} />
        </Modal>
      )}

      {pendingStatus && (
        <Modal
          title={STATUS_ACTION[pendingStatus.status].title}
          size="small"
          onClose={() => setPendingStatus(null)}
        >
          <div className="confirm">
            <p>
              <strong>{pendingStatus.fullName}</strong> ({prettyPhone(pendingStatus.phone)}){" "}
              {STATUS_ACTION[pendingStatus.status].confirm}
            </p>
            <div className="form__actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setPendingStatus(null)}
                disabled={changingStatus}
              >
                Cancel
              </button>
              <button
                type="button"
                className={STATUS_ACTION[pendingStatus.status].button}
                onClick={() => void confirmStatusChange()}
                disabled={changingStatus}
              >
                {changingStatus
                  ? "Saving…"
                  : `${STATUS_ACTION[pendingStatus.status].verb} agent`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {pendingDelete && (
        <Modal
          title="Delete agent"
          size="small"
          onClose={() => setPendingDelete(null)}
        >
          <div className="confirm">
            <p>
              <strong>{pendingDelete.fullName}</strong> ({prettyPhone(pendingDelete.phone)}) will be
              removed from the agent network. This cannot be undone.
            </p>
            <div className="form__actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button--danger"
                onClick={() => void confirmDelete()}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete agent"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
