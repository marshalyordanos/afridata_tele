import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";

type PaginationProps = {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  /** What is being counted, e.g. "agents" or "users". */
  noun?: string;
};

const PAGE_SIZES = [10, 25, 50];

/**
 * Page numbers around the current one, with gaps marked by "…" so the control
 * stays the same width however many pages there are.
 */
function pageItems(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const around = [page - 1, page, page + 1].filter((n) => n > 1 && n < pageCount);
  const pages = [1, ...around, pageCount];

  const items: (number | "gap")[] = [];
  let previous = 0;
  for (const current of pages) {
    if (current - previous > 1) items.push("gap");
    items.push(current);
    previous = current;
  }
  return items;
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
  noun = "agents",
}: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <p className="pagination__summary">
        Showing <strong>{first}</strong>–<strong>{last}</strong> of <strong>{total}</strong> {noun}
      </p>

      <div className="pagination__controls">
        <label className="pagination__size">
          Rows
          <select
            value={pageSize}
            onChange={(event) => onPageSize(Number(event.target.value))}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="pager">
          <button
            type="button"
            className="pager__step"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="icon" />
          </button>

          {pageItems(page, pageCount).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="pager__gap">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={`pager__page${item === page ? " pager__page--active" : ""}`}
                onClick={() => onPage(item)}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </button>
            ),
          )}

          <button
            type="button"
            className="pager__step"
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            <ChevronRightIcon className="icon" />
          </button>
        </div>
      </div>
    </div>
  );
}
