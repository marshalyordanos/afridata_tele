import { useState } from "react";
import { ApiError, type Admin, type AdminInput, type AdminRole, type FieldErrors } from "../lib/api";

type AdminFormProps = {
  admin: Admin | null;
  onSubmit: (input: AdminInput) => Promise<void>;
  onCancel: () => void;
};

export function AdminForm({ admin, onSubmit, onCancel }: AdminFormProps) {
  const [phone, setPhone] = useState(admin?.phone ?? "");
  const [name, setName] = useState(admin?.name ?? "");
  const [role, setRole] = useState<AdminRole>(admin?.role ?? "ADMIN");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");

    const found: FieldErrors = {};
    if (!/^\+?\d{4,20}$/.test(phone.trim())) found.phone = "Digits only, optionally a leading +.";
    if (name.trim().length < 2) found.name = "Enter a name.";
    // On edit, an empty password means "leave it as it is".
    if (!admin && password.length < 8) found.password = "Use at least 8 characters.";
    if (admin && password && password.length < 8) found.password = "Use at least 8 characters.";

    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setSaving(true);
    try {
      const input: AdminInput = { phone: phone.trim(), name: name.trim(), role };
      if (password) input.password = password;
      await onSubmit(input);
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === "PHONE_TAKEN") setErrors({ phone: caught.message });
        else if (Object.keys(caught.fields).length > 0) setErrors(caught.fields);
        else setFormError(caught.message);
      } else {
        setFormError((caught as Error).message);
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
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setErrors(({ phone: _p, ...rest }) => rest);
            }}
            placeholder="0911223344"
            inputMode="tel"
            aria-invalid={Boolean(errors.phone)}
          />
          <small className={errors.phone ? "field__error" : "field__hint"}>
            {errors.phone ?? "This is what they type to sign in."}
          </small>
        </label>

        <label className="field field--wide">
          Name
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setErrors(({ name: _n, ...rest }) => rest);
            }}
            placeholder="Desk Admin"
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && <small className="field__error">{errors.name}</small>}
        </label>

        <label className="field">
          Role
          <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </select>
          <small className="field__hint">Only super admins can manage console users.</small>
        </label>

        <label className="field">
          {admin ? "New password" : "Password"}
          <input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setErrors(({ password: _pw, ...rest }) => rest);
            }}
            placeholder={admin ? "Leave blank to keep current" : "At least 8 characters"}
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
          />
          {errors.password && <small className="field__error">{errors.password}</small>}
        </label>
      </div>

      <div className="form__actions">
        <button type="button" className="button button--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={saving}>
          {saving ? "Saving…" : admin ? "Save changes" : "Create user"}
        </button>
      </div>
    </form>
  );
}
