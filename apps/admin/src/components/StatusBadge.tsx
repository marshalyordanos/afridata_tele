import type { AgentStatus } from "../lib/api";

const LABELS: Record<AgentStatus, string> = {
  PENDING: "Pending",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
};

export function StatusBadge({ status }: { status: AgentStatus }) {
  return <span className={`badge badge--${status.toLowerCase()}`}>{LABELS[status]}</span>;
}

export const STATUS_LABELS = LABELS;
