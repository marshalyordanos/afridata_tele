import { useState } from "react";
import { ApiError, type Agent, type AgentInput, type AgentStatus, type FieldErrors } from "../lib/api";
import { STATUS_LABELS } from "./StatusBadge";

const REGIONS = [
  "Addis Ababa",
  "Afar",
  "Amhara",
  "Benishangul-Gumuz",
  "Dire Dawa",
  "Gambela",
  "Harari",
  "Oromia",
  "Sidama",
  "Somali",
  "South Ethiopia",
  "Tigray",
];

const STATUSES: AgentStatus[] = ["PENDING", "ACTIVE", "SUSPENDED"];

/** Mirrors the server rule so the form can object before a round trip. */
const PHONE_PATTERN = /^\+251[79]\d{8}$/;

/** 0986680094 and 251986680094 both mean +251986680094. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  const bare = digits.startsWith("+") ? digits.slice(1) : digits;

  let national: string;
  if (bare.startsWith("251")) national = bare.slice(3);
  else if (bare.startsWith("0")) national = bare.slice(1);
  else national = bare;

  const candidate = `+251${national}`;
  return PHONE_PATTERN.test(candidate) ? candidate : null;
}

type Draft = {
  phone: string;
  pin: string;
  fullName: string;
  businessName: string;
  region: string;
  city: string;
  status: AgentStatus;
  balance: string;
  commissionRate: string;
  note: string;
};

function toDraft(agent: Agent | null): Draft {
  return {
    phone: agent?.phone ?? "+251",
    pin: agent?.pin ?? "",
    fullName: agent?.fullName ?? "",
    businessName: agent?.businessName ?? "",
    region: agent?.region ?? "",
    city: agent?.city ?? "",
    status: agent?.status ?? "PENDING",
    balance: agent ? String(agent.balance) : "0",
    commissionRate: agent ? String(agent.commissionRate) : "1",
    note: agent?.note ?? "",
  };
}

type AgentFormProps = {
  agent: Agent | null;
  onSubmit: (input: AgentInput) => Promise<void>;
  onCancel: () => void;
};

export function AgentForm({ agent, onSubmit, onCancel }: AgentFormProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(agent));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors(({ [key]: _removed, ...rest }) => rest);
  };

  /** Client-side checks; the server repeats all of them. */
  function validate(): { input: AgentInput; errors: FieldErrors } {
    const found: FieldErrors = {};

    const phone = normalizePhone(draft.phone);
    if (!phone) found.phone = "Use the format +251986680094.";

    if (draft.fullName.trim().length < 2) found.fullName = "Enter the agent's full name.";

    // An empty PIN is allowed and clears the stored one; anything else must be six digits.
    const pin = draft.pin.trim();
    if (pin && !/^\d{6}$/.test(pin)) found.pin = "The PIN must be exactly 6 digits.";

    const balance = Number(draft.balance);
    if (!Number.isFinite(balance) || balance < 0) found.balance = "Enter a balance of 0 or more.";

    const commissionRate = Number(draft.commissionRate);
    if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      found.commissionRate = "Enter a rate between 0 and 100.";
    }

    return {
      errors: found,
      input: {
        phone: phone ?? draft.phone,
        pin: pin || null,
        fullName: draft.fullName.trim(),
        businessName: draft.businessName.trim() || null,
        region: draft.region.trim() || null,
        city: draft.city.trim() || null,
        status: draft.status,
        balance,
        commissionRate,
        note: draft.note.trim() || null,
      },
    };
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");

    const { input, errors: found } = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setSaving(true);
    try {
      await onSubmit(input);
    } catch (error) {
      if (error instanceof ApiError) {
        // A duplicate phone belongs on the phone field, not in the banner.
        if (error.code === "PHONE_TAKEN") setErrors({ phone: error.message });
        else if (Object.keys(error.fields).length > 0) setErrors(error.fields);
        else setFormError(error.message);
      } else {
        setFormError((error as Error).message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {formError && <p className="form__banner">{formError}</p>}

      <div className="form__grid">
        <label className="field field--wide">
          Phone number
          <input
            value={draft.phone}
            onChange={(event) => set("phone", event.target.value)}
            onBlur={() => {
              const normalized = normalizePhone(draft.phone);
              if (normalized) set("phone", normalized);
            }}
            placeholder="+251986680094"
            inputMode="tel"
            autoComplete="off"
            aria-invalid={Boolean(errors.phone)}
          />
          <small className={errors.phone ? "field__error" : "field__hint"}>
            {errors.phone ?? "Format: +251986680094 — 09…, 07… and 2519… are converted for you."}
          </small>
        </label>

        <label className="field field--wide">
          Telebirr PIN
          <input
            value={draft.pin}
            onChange={(event) => set("pin", event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123789"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={Boolean(errors.pin)}
          />
          <small className={errors.pin ? "field__error" : "field__hint"}>
            {errors.pin ?? "Six digits. Leave blank to clear the stored PIN."}
          </small>
        </label>

        <label className="field field--wide">
          Full name
          <input
            value={draft.fullName}
            onChange={(event) => set("fullName", event.target.value)}
            placeholder="Marshal Yordanos"
            aria-invalid={Boolean(errors.fullName)}
          />
          {errors.fullName && <small className="field__error">{errors.fullName}</small>}
        </label>

        <label className="field field--wide">
          Business name
          <input
            value={draft.businessName}
            onChange={(event) => set("businessName", event.target.value)}
            placeholder="Marshal Mobile Money"
          />
        </label>

        <label className="field">
          Region
          <select value={draft.region} onChange={(event) => set("region", event.target.value)}>
            <option value="">Not set</option>
            {REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          City / area
          <input
            value={draft.city}
            onChange={(event) => set("city", event.target.value)}
            placeholder="Bole"
          />
        </label>

        <label className="field">
          Status
          <select
            value={draft.status}
            onChange={(event) => set("status", event.target.value as AgentStatus)}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Float balance (Birr)
          <input
            value={draft.balance}
            onChange={(event) => set("balance", event.target.value)}
            inputMode="decimal"
            aria-invalid={Boolean(errors.balance)}
          />
          {errors.balance && <small className="field__error">{errors.balance}</small>}
        </label>

        <label className="field">
          Commission rate (%)
          <input
            value={draft.commissionRate}
            onChange={(event) => set("commissionRate", event.target.value)}
            inputMode="decimal"
            aria-invalid={Boolean(errors.commissionRate)}
          />
          {errors.commissionRate && <small className="field__error">{errors.commissionRate}</small>}
        </label>

        <label className="field field--wide">
          Internal note
          <textarea
            value={draft.note}
            onChange={(event) => set("note", event.target.value)}
            rows={3}
            placeholder="Anything the support team should know."
          />
        </label>
      </div>

      <div className="form__actions">
        <button type="button" className="button button--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={saving}>
          {saving ? "Saving…" : agent ? "Save changes" : "Register agent"}
        </button>
      </div>
    </form>
  );
}
