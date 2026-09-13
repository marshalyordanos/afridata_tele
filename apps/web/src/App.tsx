import { useEffect, useState } from "react";
import "./App.css";
import { fetchActiveAgents, notifyDeposit, notifyWithdraw, type Agent } from "./lib/api";
import { awaitOutcome, newRequestId } from "./lib/socket";

type Tab = "deposit" | "withdraw";
type Feedback = { kind: "success" | "error"; text: string } | null;

const birr = (value: number) =>
  new Intl.NumberFormat("en-ET", { minimumFractionDigits: 2 }).format(value);

/** What an agent is called in the dropdown: the trading name if it has one. */
const agentLabel = (agent: Agent) =>
  `${agent.businessName ?? agent.fullName} — ${agent.phone}`;

/** Nine digits after the country code is the shortest thing worth sending. */
const looksLikePhone = (value: string) => value.replace(/\D/g, "").length >= 9;

/**
 * How long to wait for the agent's phone before giving up.
 *
 * It has to open telebirr, sign in, load the transaction history and then open
 * receipts one by one until the reference turns up — up to twenty of them. This
 * is generous on purpose, and stops a little before the server drops the
 * request so the customer sees a reason rather than silence.
 */
const ANSWER_TIMEOUT_MS = 240_000;

export default function App() {
  const [tab, setTab] = useState<Tab>("deposit");

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [loading, setLoading] = useState(true);

  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  // Set while the agent's phone is off checking telebirr, so the button can say
  // what is actually happening instead of just spinning.
  const [waiting, setWaiting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    fetchActiveAgents()
      .then((list) => {
        setAgents(list);
        if (list.length > 0) setAgentId(list[0].id);
      })
      .catch((error: Error) => setFeedback({ kind: "error", text: error.message }))
      .finally(() => setLoading(false));
  }, []);

  const agent = agents.find((item) => item.id === agentId);
  const who = agent ? agent.businessName ?? agent.fullName : "the agent";

  /** Keep each tab's result from leaking into the other. */
  function switchTab(next: Tab) {
    setTab(next);
    setFeedback(null);
  }

  /** Both tabs report the same two outcomes, so they say so the same way. */
  function report(sent: boolean, what: string) {
    setFeedback({
      kind: sent ? "success" : "error",
      text: sent
        ? `${what} sent to ${who}. They will confirm it on their side.`
        : `${who} is offline right now, so they did not get ${what.toLowerCase()}. Try again shortly.`,
    });
  }

  async function onDeposit() {
    setPending(true);
    setFeedback(null);

    const requestId = newRequestId();
    const typed = reference.trim();
    // Listening starts BEFORE the request is made: the phone can answer in less
    // time than it takes to attach a listener afterwards, and that answer would
    // then be missed entirely.
    const { promise, stop } = awaitOutcome(requestId, ANSWER_TIMEOUT_MS);

    try {
      const sent = await notifyDeposit(agentId, typed, requestId);

      if (!sent.notified) {
        stop();
        setFeedback({
          kind: "error",
          text: `${who} is offline right now, so nobody can check reference ${typed}. Try again shortly.`,
        });
        return;
      }

      setWaiting(true);
      setFeedback({
        kind: "success",
        text: `Sent to ${who}. Checking telebirr for ${typed} — this takes up to a minute.`,
      });

      const outcome = await promise;

      if (!outcome) {
        setFeedback({
          kind: "error",
          text: `${who} did not answer in time. Your money is not lost — try checking ${typed} again in a moment.`,
        });
        return;
      }

      if (outcome.status === "confirmed") {
        setReference("");
        setFeedback({
          kind: "success",
          text: `Deposited successfully. ${who} confirmed ${outcome.reference} for ${birr(outcome.amount)} Birr.`,
        });
        return;
      }

      setFeedback({
        kind: "error",
        text:
          outcome.status === "not_found"
            ? `${who} has no record of a payment with reference ${outcome.reference}. Check the number on your receipt.`
            : `${who} could not check telebirr just now (${outcome.reason}). Try again shortly.`,
      });
    } catch (error) {
      stop();
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setWaiting(false);
      setPending(false);
    }
  }

  async function onWithdraw() {
    setPending(true);
    setFeedback(null);
    try {
      const result = await notifyWithdraw(agentId, phone.trim(), Number(amount));
      setAmount("");
      report(result.notified, `Cash-out of ${birr(result.amount)} Birr to ${result.phone}`);
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setPending(false);
    }
  }

  const parsedAmount = Number(amount);
  const canDeposit = !!agentId && reference.trim().length > 0;
  const canWithdraw =
    !!agentId &&
    looksLikePhone(phone) &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;

  const submit = tab === "deposit" ? onDeposit : onWithdraw;
  const ready = tab === "deposit" ? canDeposit : canWithdraw;

  /** Enter submits whichever tab is open, when that tab is complete. */
  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && ready && !pending) submit();
  };

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">telebirr Wallet</h1>
        <p className="app-subtitle">Deposit and withdraw through an agent</p>
      </header>

      <main className="card">
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "deposit"}
            className={`tab ${tab === "deposit" ? "tab-active" : ""}`}
            onClick={() => switchTab("deposit")}
          >
            Deposit
          </button>
          <button
            role="tab"
            aria-selected={tab === "withdraw"}
            className={`tab ${tab === "withdraw" ? "tab-active" : ""}`}
            onClick={() => switchTab("withdraw")}
          >
            Withdraw
          </button>
        </div>

        {loading ? (
          <div className="loading-state">Loading agents…</div>
        ) : (
          <>
            {/* The agent comes first on both tabs — nothing below it means
                anything until the customer has said who they are dealing with. */}
            <div className="field">
              <label className="label" htmlFor="agent">
                Agent
              </label>
              {agents.length === 0 ? (
                <p className="hint">No active agents are available right now.</p>
              ) : (
                <>
                  <select
                    id="agent"
                    className="select"
                    value={agentId}
                    onChange={(event) => setAgentId(event.target.value)}
                  >
                    {agents.map((item) => (
                      <option key={item.id} value={item.id}>
                        {agentLabel(item)}
                      </option>
                    ))}
                  </select>
                  {agent && (
                    <p className="hint">
                      {agent.fullName}
                      {agent.city ? ` · ${agent.city}` : ""}
                      {agent.region ? `, ${agent.region}` : ""}
                    </p>
                  )}
                </>
              )}
            </div>

            {tab === "deposit" ? (
              <div className="field">
                <label className="label" htmlFor="reference">
                  Reference number
                </label>
                <input
                  id="reference"
                  className="input"
                  placeholder="e.g. TB100002"
                  value={reference}
                  autoComplete="off"
                  disabled={pending}
                  onChange={(event) => setReference(event.target.value.toUpperCase())}
                  onKeyDown={onEnter}
                />
                <p className="hint">
                  Enter the reference from your telebirr receipt. It goes straight to the
                  agent, who confirms it against their own account.
                </p>
              </div>
            ) : (
              <>
                <div className="field">
                  <label className="label" htmlFor="phone">
                    Your phone number
                  </label>
                  <input
                    id="phone"
                    className="input"
                    type="tel"
                    inputMode="tel"
                    placeholder="0912345678"
                    value={phone}
                    autoComplete="tel"
                    onChange={(event) => setPhone(event.target.value)}
                    onKeyDown={onEnter}
                  />
                  <p className="hint">The telebirr number the agent should send to.</p>
                </div>

                <div className="field">
                  <label className="label" htmlFor="amount">
                    Amount
                  </label>
                  <input
                    id="amount"
                    className="input"
                    type="number"
                    min="1"
                    step="any"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    onKeyDown={onEnter}
                  />
                  <p className="hint">How much you want to take out in cash, in Birr.</p>
                </div>
              </>
            )}

            <button className="button" disabled={!ready || pending} onClick={submit}>
              {pending && <span className="spinner" aria-hidden="true" />}
              {pending
                ? tab === "deposit"
                  ? waiting
                    ? "Checking telebirr…"
                    : "Sending…"
                  : "Sending…"
                : tab === "deposit"
                  ? "Check"
                  : "Request cash-out"}
            </button>

            {feedback && (
              <div
                className={`alert ${feedback.kind === "success" ? "alert-success" : "alert-error"}`}
                role="status"
              >
                {feedback.text}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
