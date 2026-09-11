# telebirr-web

React + TypeScript + Vite front end for the wallet API in `../server`.

## Setup

```bash
npm install
cp .env.example .env    # VITE_API_URL=http://localhost:4000
npm run dev             # http://localhost:5173
```

The API server must be running first:

```bash
cd ../server && npm run dev
```

## Screens

One card with two tabs:

- **Deposit** — pick a phone number, type the reference number from the deposit
  slip, and press **Check**. A valid unclaimed reference credits the account.
- **Withdraw** — pick a phone number, enter an amount, press **Withdraw**.

Both buttons show a spinner while the request is in flight and stay disabled
until the form is valid.

## Test references

`npm run db:seed` in the server creates these unclaimed deposit references:

| Reference  | Amount |
| ---------- | ------ |
| `TB100001` | 500    |
| `TB100002` | 1000   |
| `TB100003` | 2500   |

Each can only be claimed once — checking it twice returns "already used".
