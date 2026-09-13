import { useEffect, useRef, useState } from "react";
import "./App.css";
import { fetchActiveAgents, notifyDeposit, notifyWithdraw, type Agent } from "./lib/api";
import { awaitOutcome, newRequestId } from "./lib/socket";
import { STRINGS, other, type Lang } from "./lib/i18n";
import {
  AlertCircle,
  Check,
  CheckCircle,
  ChevronLeft,
  Clock,
  Copy,
  Globe,
  Info,
  Lock,
  Question,
  ShieldCheck,
  WalletMark,
} from "./lib/icons";

type Tab = "deposit" | "withdraw";
type Feedback = { kind: "success" | "error" | "info"; text: string } | null;

const birr = (value: number) =>
  new Intl.NumberFormat("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

/** What an agent is called in the dropdown: the trading name if it has one. */
const agentLabel = (agent: Agent) =>
  `${agent.businessName ?? agent.fullName} — ${agent.phone}`;

/** Nine digits after the country code is the shortest thing worth sending. */
const looksLikePhone = (value: string) => value.replace(/\D/g, "").length >= 9;

/** m:ss, for the countdown. */
const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

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
  const [lang, setLang] = useState<Lang>("en");
  const t = STRINGS[lang];

  const [tab, setTab] = useState<Tab>("deposit");

  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [loading, setLoading] = useState(true);

  const [reference, setReference] = useState("");
  const [sentAmount, setSentAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  // Set while the agent's phone is off checking telebirr, so the button can say
  // what is actually happening instead of just spinning.
  const [waiting, setWaiting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);
  // The moment the current check runs out, or null when nothing is running. A
  // deadline rather than a running total, so a slow tick cannot drift.
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Set once the agent's phone confirms, so the header can show the real figure
  // rather than whatever the customer typed.
  const [settled, setSettled] = useState<number | null>(null);

  const referenceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchActiveAgents()
      .then((list) => {
        setAgents(list);
        if (list.length > 0) setAgentId(list[0].id);
      })
      .catch((error: Error) => setFeedback({ kind: "error", text: error.message }))
      .finally(() => setLoading(false));
  }, []);

  /** Ticks once a second only while a deadline is live. */
  useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [deadline]);

  /** The copied-confirmation is a flash, not a state worth keeping. */
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  const agent = agents.find((item) => item.id === agentId);
  const who = agent ? (agent.businessName ?? agent.fullName) : "the agent";

  /** Keep each tab's result from leaking into the other. */
  function switchTab(next: Tab) {
    if (pending) return;
    setTab(next);
    setFeedback(null);
    setSettled(null);
  }

  async function copyNumber() {
    if (!agent) return;
    try {
      await navigator.clipboard.writeText(agent.phone);
      setCopied(true);
    } catch {
      // Clipboard is blocked outside a secure context; the number is on screen
      // and can still be read off it, so this is not worth an error message.
    }
  }

  /** Pulls the reference out of a pasted SMS, so the whole message can be pasted. */
  async function pasteReference() {
    try {
      const text = await navigator.clipboard.readText();
      const match = text.match(/[A-Z0-9]{6,}/i);
      setReference((match ? match[0] : text.trim()).toUpperCase().slice(0, 64));
      referenceRef.current?.focus();
    } catch {
      referenceRef.current?.focus();
    }
  }

  async function onDeposit() {
    setPending(true);
    setFeedback(null);
    setSettled(null);

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
        setFeedback({ kind: "error", text: t.errOffline(who, typed) });
        return;
      }

      setWaiting(true);
      setNow(Date.now());
      setDeadline(Date.now() + ANSWER_TIMEOUT_MS);
      setFeedback({ kind: "info", text: t.sentChecking(who, typed) });

      const outcome = await promise;

      if (!outcome) {
        setFeedback({ kind: "error", text: t.noAnswer(who, typed) });
        return;
      }

      if (outcome.status === "confirmed") {
        setReference("");
        setSentAmount("");
        setSettled(outcome.amount);
        setFeedback({
          kind: "success",
          text: t.confirmed(who, outcome.reference, birr(outcome.amount)),
        });
        return;
      }

      setFeedback({
        kind: "error",
        text:
          outcome.status === "not_found"
            ? t.notFound(who, outcome.reference)
            : t.readFailed(who, outcome.reason),
      });
    } catch (error) {
      stop();
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setWaiting(false);
      setDeadline(null);
      setPending(false);
    }
  }

  async function onWithdraw() {
    setPending(true);
    setFeedback(null);
    try {
      const result = await notifyWithdraw(agentId, phone.trim(), Number(amount));
      setAmount("");
      setFeedback({
        kind: result.notified ? "success" : "error",
        text: result.notified
          ? t.cashOutSent(who, birr(result.amount), result.phone)
          : t.errOfflineGeneric(who, `${birr(result.amount)} ${t.currency}`),
      });
    } catch (error) {
      setFeedback({ kind: "error", text: (error as Error).message });
    } finally {
      setPending(false);
    }
  }

  // Derived during render: the pill shows time left, clamped at zero.
  const remaining = deadline === null ? null : Math.max(0, deadline - now);

  const parsedAmount = Number(amount);
  const canDeposit = !!agentId && reference.trim().length > 0;
  const canWithdraw =
    !!agentId &&
    looksLikePhone(phone) &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;

  const isDeposit = tab === "deposit";
  const submit = isDeposit ? onDeposit : onWithdraw;
  const ready = isDeposit ? canDeposit : canWithdraw;

  /** Enter submits whichever tab is open, when that tab is complete. */
  const onEnter = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && ready && !pending) submit();
  };

  /* The figure in the header: what the agent confirmed if they have, otherwise
     whatever the customer has typed so far, otherwise a dash. */
  const headerAmount =
    settled !== null
      ? birr(settled)
      : isDeposit
        ? Number(sentAmount) > 0
          ? birr(Number(sentAmount))
          : null
        : parsedAmount > 0
          ? birr(parsedAmount)
          : null;

  return (
    <div className="page">
      <header className="topbar">
        <button className="topbar-back" type="button">
          <ChevronLeft />
          <span>{t.back}</span>
        </button>

        <div className="brand">
          <span className="brand-mark">T</span>
          <span className="brand-name">telebirr</span>
        </div>

        <button className="lang" type="button" onClick={() => setLang(other(lang))}>
          <Globe />
          {t.langName}
        </button>
      </header>

      <div className="shell">
        {/* Method, amount and — while a check is live — the clock. */}
        <section className="summary">
          <div className="summary-method">
            <span className="summary-logo">
              <WalletMark />
            </span>
            <div>
              <div className="summary-name">
                {isDeposit ? t.methodDeposit : t.methodWithdraw}
              </div>
              <div className="summary-sub">{t.methodRegion}</div>
            </div>
          </div>

          <div className="summary-divider" />

          <div className="summary-amount">
            <span className={`summary-value ${headerAmount ? "" : "summary-value-muted"}`}>
              {headerAmount ?? t.amountPlaceholder}
            </span>
            <span className="summary-currency">{t.currency}</span>
          </div>

          {remaining !== null && (
            <div className="summary-timer" role="timer" aria-live="off">
              <span className="pulse" />
              <span className="summary-timer-value">{clock(remaining)}</span>
              <span className="summary-timer-label">{t.timeLeft}</span>
            </div>
          )}
        </section>

        <div className="columns">
          <main className="panel">
            <div className="panel-body">
              <div className="tabs" role="tablist">
                <button
                  role="tab"
                  type="button"
                  aria-selected={isDeposit}
                  disabled={pending}
                  className={`tab ${isDeposit ? "tab-active" : ""}`}
                  onClick={() => switchTab("deposit")}
                >
                  {t.tabDeposit}
                </button>
                <button
                  role="tab"
                  type="button"
                  aria-selected={!isDeposit}
                  disabled={pending}
                  className={`tab ${!isDeposit ? "tab-active" : ""}`}
                  onClick={() => switchTab("withdraw")}
                >
                  {t.tabWithdraw}
                </button>
              </div>

              {loading ? (
                <div aria-label={t.loadingAgents}>
                  <div className="skeleton" />
                  <div className="skeleton" />
                  <div className="skeleton" />
                </div>
              ) : isDeposit ? (
                <DepositSteps
                  t={t}
                  agents={agents}
                  agent={agent}
                  agentId={agentId}
                  setAgentId={setAgentId}
                  reference={reference}
                  setReference={setReference}
                  sentAmount={sentAmount}
                  setSentAmount={setSentAmount}
                  pending={pending}
                  copied={copied}
                  copyNumber={copyNumber}
                  pasteReference={pasteReference}
                  referenceRef={referenceRef}
                  onEnter={onEnter}
                />
              ) : (
                <WithdrawSteps
                  t={t}
                  agents={agents}
                  agent={agent}
                  agentId={agentId}
                  setAgentId={setAgentId}
                  phone={phone}
                  setPhone={setPhone}
                  amount={amount}
                  setAmount={setAmount}
                  pending={pending}
                  onEnter={onEnter}
                />
              )}

              {!loading && (
                <>
                  <button
                    className="submit"
                    type="button"
                    disabled={!ready || pending}
                    onClick={submit}
                  >
                    {pending && <span className="spinner" aria-hidden="true" />}
                    {pending
                      ? isDeposit && waiting
                        ? t.checking
                        : t.sending
                      : isDeposit
                        ? t.confirmPayment
                        : t.requestCashOut}
                    {!pending && isDeposit && <span aria-hidden="true">→</span>}
                  </button>

                  <div className="trust">
                    <span className="trust-item">
                      <Lock />
                      {t.trustEncrypted}
                    </span>
                    <span className="trust-item">
                      <ShieldCheck />
                      {t.trustVerified}
                    </span>
                    <span className="trust-item">
                      <Clock />
                      {t.trustAuto}
                    </span>
                  </div>
                </>
              )}

              {feedback && (
                <div
                  className={`alert alert-${feedback.kind}`}
                  role={feedback.kind === "error" ? "alert" : "status"}
                >
                  {feedback.kind === "success" ? (
                    <CheckCircle />
                  ) : feedback.kind === "error" ? (
                    <AlertCircle />
                  ) : (
                    <Info />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}
            </div>
          </main>

          <HowTo t={t} isDeposit={isDeposit} agentPhone={agent?.phone} />
        </div>
      </div>
    </div>
  );
}

type Strings = (typeof STRINGS)["en"];

/**
 * Jumps to the walkthrough panel.
 *
 * A button rather than an anchor: on a narrow screen the panel is below rather
 * than beside the form, so this is a scroll, not a destination.
 */
function HelpLink({ label }: { label: string }) {
  return (
    <button
      className="help-link"
      type="button"
      onClick={() =>
        document.getElementById("how-to-pay")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }
    >
      <Question />
      {label}
    </button>
  );
}

/** The agent picker, shared by both tabs and always the first thing asked. */
function AgentField({
  t,
  agents,
  agent,
  agentId,
  setAgentId,
  pending,
}: {
  t: Strings;
  agents: Agent[];
  agent: Agent | undefined;
  agentId: string;
  setAgentId: (id: string) => void;
  pending: boolean;
}) {
  if (agents.length === 0) {
    return <p className="empty">{t.agentHintNone}</p>;
  }

  return (
    <div className="field">
      <label className="label" htmlFor="agent">
        {t.agentLabel}
      </label>
      <select
        id="agent"
        className="select"
        value={agentId}
        disabled={pending}
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
    </div>
  );
}

function DepositSteps({
  t,
  agents,
  agent,
  agentId,
  setAgentId,
  reference,
  setReference,
  sentAmount,
  setSentAmount,
  pending,
  copied,
  copyNumber,
  pasteReference,
  referenceRef,
  onEnter,
}: {
  t: Strings;
  agents: Agent[];
  agent: Agent | undefined;
  agentId: string;
  setAgentId: (id: string) => void;
  reference: string;
  setReference: (value: string) => void;
  sentAmount: string;
  setSentAmount: (value: string) => void;
  pending: boolean;
  copied: boolean;
  copyNumber: () => void;
  pasteReference: () => void;
  referenceRef: React.RefObject<HTMLInputElement | null>;
  onEnter: (event: React.KeyboardEvent) => void;
}) {
  const typedAmount = Number(sentAmount) > 0 ? `${birr(Number(sentAmount))} ${t.currency}` : null;

  return (
    <>
      <section className="step">
        <span className={`step-index ${agent ? "step-index-active" : ""}`}>1</span>
        <div>
          <div className="step-head">
            <h2 className="step-title">
              {typedAmount ? t.stepPayTitle(typedAmount) : t.stepPayTitleNoAmount}
            </h2>
            <HelpLink label={t.howToPay} />
          </div>

          <div className="step-body">
            <AgentField
              t={t}
              agents={agents}
              agent={agent}
              agentId={agentId}
              setAgentId={setAgentId}
              pending={pending}
            />

            {/* The number to pay — the single most important thing here. */}
            {agent ? (
              <div className="payto" style={{ marginTop: 16 }}>
                <div className="payto-main">
                  <div className="payto-label">{t.mobileNumber}</div>
                  <div className="payto-value">{agent.phone}</div>
                </div>
                <button
                  className={`payto-copy ${copied ? "payto-copy-done" : ""}`}
                  type="button"
                  onClick={copyNumber}
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? t.copied : t.copy}
                </button>
              </div>
            ) : (
              agents.length > 0 && <div className="payto-empty">{t.pickAgentFirst}</div>
            )}

            <div className="recipe">
              {t.recipe.map((part, index) => (
                <span className="recipe-pair" key={part}>
                  <span className="recipe-step">{part}</span>
                  {index < t.recipe.length - 1 && (
                    <span className="recipe-arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                </span>
              ))}
            </div>

            <div className="field" style={{ marginTop: 16 }}>
              <label className="label" htmlFor="sent-amount">
                {t.optionalAmountLabel}
              </label>
              <div className="amount-wrap">
                <span className="amount-prefix">{t.currency}</span>
                <input
                  id="sent-amount"
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  placeholder={t.amountPlaceholderField}
                  value={sentAmount}
                  disabled={pending}
                  onChange={(event) => setSentAmount(event.target.value)}
                  onKeyDown={onEnter}
                />
              </div>
              <p className="hint">{t.optionalAmountHint}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="step">
        <span className={`step-index ${reference.trim() ? "step-index-done" : ""}`}>2</span>
        <div>
          <h2 className="step-title">{t.stepRefTitle}</h2>
          <p className="step-note">{t.stepRefNote}</p>

          <div className="step-body">
            <label className="sr-only" htmlFor="reference">
              {t.referenceLabel}
            </label>
            <div className="input-group">
              <input
                id="reference"
                ref={referenceRef}
                className="input input-code"
                placeholder={t.referencePlaceholder}
                value={reference}
                autoComplete="off"
                spellCheck={false}
                disabled={pending}
                onChange={(event) => setReference(event.target.value.toUpperCase())}
                onKeyDown={onEnter}
              />
              <button
                className="input-group-action"
                type="button"
                disabled={pending}
                onClick={pasteReference}
              >
                {t.paste}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function WithdrawSteps({
  t,
  agents,
  agent,
  agentId,
  setAgentId,
  phone,
  setPhone,
  amount,
  setAmount,
  pending,
  onEnter,
}: {
  t: Strings;
  agents: Agent[];
  agent: Agent | undefined;
  agentId: string;
  setAgentId: (id: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  pending: boolean;
  onEnter: (event: React.KeyboardEvent) => void;
}) {
  return (
    <>
      <section className="step">
        <span className={`step-index ${looksLikePhone(phone) ? "step-index-done" : "step-index-active"}`}>
          1
        </span>
        <div>
          <div className="step-head">
            <h2 className="step-title">{t.stepWhoTitle}</h2>
            <HelpLink label={t.howItWorks} />
          </div>

          <div className="step-body">
            <AgentField
              t={t}
              agents={agents}
              agent={agent}
              agentId={agentId}
              setAgentId={setAgentId}
              pending={pending}
            />

            <div className="field">
              <label className="label" htmlFor="phone">
                {t.phoneLabel}
              </label>
              <input
                id="phone"
                className="input input-code"
                type="tel"
                inputMode="tel"
                placeholder={t.phonePlaceholder}
                value={phone}
                autoComplete="tel"
                disabled={pending}
                onChange={(event) => setPhone(event.target.value)}
                onKeyDown={onEnter}
              />
              <p className="hint">{t.phoneHint}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="step">
        <span className={`step-index ${Number(amount) > 0 ? "step-index-done" : ""}`}>2</span>
        <div>
          <h2 className="step-title">{t.stepAmountTitle}</h2>

          <div className="step-body">
            <label className="sr-only" htmlFor="amount">
              {t.amountLabel}
            </label>
            <div className="amount-wrap">
              <span className="amount-prefix">{t.currency}</span>
              <input
                id="amount"
                className="input"
                type="number"
                min="1"
                step="any"
                inputMode="decimal"
                placeholder={t.amountPlaceholderField}
                value={amount}
                disabled={pending}
                onChange={(event) => setAmount(event.target.value)}
                onKeyDown={onEnter}
              />
            </div>
            <p className="hint">{t.amountHint}</p>
          </div>
        </div>
      </section>
    </>
  );
}

/** The right-hand column: a drawn handset and the steps in words. */
function HowTo({
  t,
  isDeposit,
  agentPhone,
}: {
  t: Strings;
  isDeposit: boolean;
  agentPhone?: string;
}) {
  return (
    <aside className="aside" id="how-to-pay">
      <div className="aside-head">
        <h2 className="aside-title">
          {isDeposit ? t.asideTitleDeposit : t.asideTitleWithdraw}
        </h2>
        <span className="aside-tag">{t.asideTag}</span>
      </div>

      <div className="aside-body">
        <div className="phone" aria-hidden="true">
          <div className="phone-screen">
            <div className="phone-notch" />
            <div className="phone-appbar">{t.phoneAppTitle}</div>
            <div className="phone-tabs">
              <span className={isDeposit ? "phone-tab-on" : ""}>{t.phoneTabDeposit}</span>
              <span className={isDeposit ? "" : "phone-tab-on"}>{t.phoneTabWithdraw}</span>
              <span>{t.phoneTabHistory}</span>
            </div>
            <div className="phone-row">
              <span>{t.phoneRowMethod}</span>
              <strong>P2P</strong>
            </div>
            <div className="phone-row">
              <span>{t.phoneRowAgent}</span>
              <span className="phone-row-code">{agentPhone ?? "09•• ••• •••"}</span>
            </div>
            <div className="phone-cta">{t.phoneCta}</div>
          </div>
        </div>

        <ol className="walkthrough">
          {(isDeposit ? t.walkDeposit : t.walkWithdraw).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </div>

      <div className="aside-foot">
        <ShieldCheck size={14} />
        <span>{t.asideFoot}</span>
      </div>
    </aside>
  );
}
