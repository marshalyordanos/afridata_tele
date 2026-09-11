import { useEffect, useState } from "react";
import "./App.css";
import { checkDeposit, fetchUsers, withdraw, type User } from "./lib/api";

type Tab = "deposit" | "withdraw";
type Feedback = { kind: "success" | "error"; text: string } | null;

const birr = (value: number) =>
  new Intl.NumberFormat("en-ET", { minimumFractionDigits: 2 }).format(value);

export default function App() {
  const [tab, setTab] = useState<Tab>("deposit");
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);

  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    fetchUsers()
      .then((list) => {
        setUsers(list);
        if (list.length > 0) setUserId(list[0].id);
      })
      .catch((error: Error) => setFeedback({ kind: "error", text: error.message }))
      .finally(() => setLoadingUsers(false));
  }, []);

  const selected = users.find((user) => user.id === userId);

  /** Keep each tab's result from leaking into the other. */
  function switchTab(next: Tab) {
    setTab(next);
    setFeedback(null);
  }

  /** Reflect the new balance locally so the header updates without a refetch. */
  function applyBalance(balance: number) {
    setUsers((current) =>
      current.map((user) => (user.id === userId ? { ...user, balance } : user)),
    );
  }

  async function onCheckDeposit() {
    setPending(true);
    setFeedback(null);
    try {
      const result = await checkDeposit(userId, reference.trim());
      applyBalance(result.balance);
      setReference("");
      setFeedback({
        kind: "success",
        text: `Deposit of ${birr(result.amount)} Birr confirmed. New balance: ${birr(result.balance)} Birr.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setPending(false);
    }
  }

  async function onWithdraw() {
    setPending(true);
    setFeedback(null);
    try {
      const result = await withdraw(userId, Number(amount));
      applyBalance(result.balance);
      setAmount("");
      setFeedback({
        kind: "success",
        text: `Withdrew ${birr(result.amount)} Birr. Reference ${result.reference}. New balance: ${birr(result.balance)} Birr.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setPending(false);
    }
  }

  const parsedAmount = Number(amount);
  const canWithdraw =
    !!userId && amount.trim() !== "" && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const canCheck = !!userId && reference.trim().length >= 4;

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">telebirr Wallet</h1>
        <p className="app-subtitle">Deposit and withdraw from your account</p>
      </header>

      {selected && (
        <div className="balance">
          <div className="balance-label">Available balance</div>
          <div className="balance-amount">{birr(selected.balance)} Birr</div>
          <div className="balance-phone">
            {selected.name} · {selected.phone}
          </div>
        </div>
      )}

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

        {loadingUsers ? (
          <div className="loading-state">Loading accounts…</div>
        ) : (
          <>
            <div className="field">
              <label className="label" htmlFor="account">
                Phone number
              </label>
              <select
                id="account"
                className="select"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.phone} — {user.name}
                  </option>
                ))}
              </select>
            </div>

            {tab === "deposit" ? (
              <>
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
                    onChange={(event) => setReference(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canCheck && !pending) onCheckDeposit();
                    }}
                  />
                  <p className="hint">
                    Enter the reference from your deposit slip, then check it.
                  </p>
                </div>

                <button
                  className="button"
                  disabled={!canCheck || pending}
                  onClick={onCheckDeposit}
                >
                  {pending && <span className="spinner" aria-hidden="true" />}
                  {pending ? "Checking…" : "Check"}
                </button>
              </>
            ) : (
              <>
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
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && canWithdraw && !pending) onWithdraw();
                    }}
                  />
                  <p className="hint">Amount in Birr to withdraw from this account.</p>
                </div>

                <button
                  className="button"
                  disabled={!canWithdraw || pending}
                  onClick={onWithdraw}
                >
                  {pending && <span className="spinner" aria-hidden="true" />}
                  {pending ? "Processing…" : "Withdraw"}
                </button>
              </>
            )}

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
