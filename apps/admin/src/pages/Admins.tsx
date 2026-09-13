import { useCallback, useEffect, useState } from "react";
import {
  createAdmin,
  deleteAdmin,
  listAdmins,
  updateAdmin,
  type Admin,
  type AdminInput,
  type Paginated,
} from "../lib/api";
import { initials, shortDate } from "../lib/format";
import { AdminForm } from "../components/AdminForm";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { EditIcon, SearchIcon, TrashIcon } from "../components/Icons";
import type { ToastMessage } from "../components/Toast";
import type { AdminProfile } from "../lib/session";

type AdminsPageProps = {
  me: AdminProfile;
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
  onToast: (toast: ToastMessage) => void;
};

export function AdminsPage({ me, formOpen, onFormOpenChange, onToast }: AdminsPageProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState<Paginated<Admin> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Admin | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Admin | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listAdmins(page, pageSize, search.trim() || undefined));
      setError("");
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  function closeForm() {
    setEditing(null);
    onFormOpenChange(false);
  }

  async function handleSubmit(input: AdminInput) {
    if (editing) {
      await updateAdmin(editing.id, input);
      onToast({ kind: "success", text: `${input.name} updated.` });
    } else {
      await createAdmin(input);
      onToast({ kind: "success", text: `${input.name} can now sign in.` });
    }
    closeForm();
    await load();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteAdmin(pendingDelete.id);
      onToast({ kind: "success", text: `${pendingDelete.name} removed.` });
      setPendingDelete(null);
      await load();
    } catch (caught) {
      onToast({ kind: "error", text: (caught as Error).message });
    } finally {
      setDeleting(false);
    }
  }

  const rows = data?.items ?? [];

  return (
    <>
      <section className="panel">
        <div className="panel__head">
          <div>
            <h2>Console users</h2>
            <p>Only a super admin can create or remove these accounts · {data?.total ?? 0} total</p>
          </div>

          <div className="toolbar">
            <div className="search">
              <SearchIcon className="icon search__icon" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search name or phone…"
                aria-label="Search admins"
              />
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
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Last signed in</th>
                  <th>Created</th>
                  <th>
                    <span className="sr-only-label">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  !data &&
                  Array.from({ length: 5 }, (_, index) => (
                    <tr key={index}>
                      {Array.from({ length: 6 }, (_, cell) => (
                        <td key={cell}>
                          <span className="skeleton" />
                        </td>
                      ))}
                    </tr>
                  ))}

                {rows.map((admin) => (
                  <tr key={admin.id}>
                    <td>
                      <div className="cell-agent">
                        <span className="avatar">{initials(admin.name)}</span>
                        <div>
                          <strong>{admin.name}</strong>
                          <small>{admin.id === me.id ? "That's you" : "Console user"}</small>
                        </div>
                      </div>
                    </td>
                    <td className="cell-mono">{admin.phone}</td>
                    <td>
                      <span
                        className={`badge ${
                          admin.role === "SUPER_ADMIN" ? "badge--super" : "badge--admin"
                        }`}
                      >
                        {admin.role === "SUPER_ADMIN" ? "Super admin" : "Admin"}
                      </span>
                    </td>
                    <td className="muted">
                      {admin.lastLoginAt ? shortDate(admin.lastLoginAt) : "Never"}
                    </td>
                    <td className="muted">{shortDate(admin.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => {
                            setEditing(admin);
                            onFormOpenChange(true);
                          }}
                          aria-label={`Edit ${admin.name}`}
                        >
                          <EditIcon className="icon" />
                        </button>
                        <button
                          type="button"
                          className="icon-button icon-button--danger"
                          onClick={() => setPendingDelete(admin)}
                          disabled={admin.id === me.id}
                          aria-label={`Delete ${admin.name}`}
                          title={admin.id === me.id ? "You cannot delete your own account" : undefined}
                        >
                          <TrashIcon className="icon" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="state">
                        <h3>No users found</h3>
                        <p>Create a console user to let someone else manage agents.</p>
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
            noun="users"
          />
        )}
      </section>

      {formOpen && (
        <Modal
          title={editing ? "Edit console user" : "Create console user"}
          description={
            editing
              ? "Change their details, role or password."
              : "Give someone access to this admin console."
          }
          onClose={closeForm}
        >
          <AdminForm admin={editing} onSubmit={handleSubmit} onCancel={closeForm} />
        </Modal>
      )}

      {pendingDelete && (
        <Modal title="Delete console user" size="small" onClose={() => setPendingDelete(null)}>
          <div className="confirm">
            <p>
              <strong>{pendingDelete.name}</strong> ({pendingDelete.phone}) will lose access to the
              console immediately. This cannot be undone.
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
                {deleting ? "Deleting…" : "Delete user"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
