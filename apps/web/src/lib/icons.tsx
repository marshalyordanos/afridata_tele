/** Inline stroke icons, so the page pulls in no icon font or package. */

type Props = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const ChevronLeft = ({ size = 16 }: Props) => (
  <svg {...base(size)}><path d="m15 18-6-6 6-6" /></svg>
);

export const Globe = ({ size = 16 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
  </svg>
);

export const Copy = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const Check = ({ size = 15 }: Props) => (
  <svg {...base(size)}><path d="M20 6 9 17l-5-5" /></svg>
);

export const Question = ({ size = 14 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4" />
    <path d="M12 17.5h.01" />
  </svg>
);

export const Lock = ({ size = 13 }: Props) => (
  <svg {...base(size)}>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);

export const ShieldCheck = ({ size = 13 }: Props) => (
  <svg {...base(size)}>
    <path d="M12 3 5 6v5c0 4.4 3 8 7 10 4-2 7-5.6 7-10V6l-7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const Clock = ({ size = 13 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const Info = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const AlertCircle = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </svg>
);

export const CheckCircle = ({ size = 15 }: Props) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5L16 9.5" />
  </svg>
);

/** The payment-method mark in the summary strip. */
export const WalletMark = ({ size = 20 }: Props) => (
  <svg {...base(size)}>
    <path d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="M16 13h2" />
  </svg>
);
