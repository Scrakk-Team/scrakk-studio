---
title: "Account"
group: features
order: 250
summary: "Sign-in with email + a 6-digit code, the multi-account switcher, and how the selected account scopes the Social panel and its Realtime events."
---
# Account

The **Account** flow signs you into a Scrakk account. It is the same method as the CLI: enter
an email, receive a **6-digit code**, enter it, and you are in. There are no passwords. All
account work happens behind IPC in the main process: the renderer sees profiles and results,
never tokens or keys.

## Signing in

The UI is `AuthGate` → `EmailCodeForm` (`features/social/components`). It serves both new and
existing accounts in one flow:

1. **Email step** — a form validates the address with `ACCOUNT_RULES.email` and calls
   `onRequestCode(email)`, which reaches `account.requestCode({ email })`. The main process
   triggers the code email. On success the form moves to the code step.
2. **Code step** — `CodeSlots` renders six boxes (`length={6}`) and auto-verifies when all six
   digits are entered. Verification calls `onVerifyCode(email, code)` →
   `account.verifyCode({ email, code })`, checked against `ACCOUNT_RULES.code` (`/^\d{6}$/`).
   The step also offers **Change email** and **Resend code**.

`AuthGate` accepts an optional `onCancel`. Without it (no session yet) the gate is the panel's
login; with it (already signed in) the same form is used to **add another account**.

```ts
import { account } from '@services/account'

await account.requestCode({ email })
const res = await account.verifyCode({ email, code })
if (res.ok) res.data // AccountProfile
```

## The account service

`@services/account` is a thin per-call IPC wrapper. Each call carries an `accountId` (the
account's `auth.users.id`) so a panel always names the account it means.

| Method | Purpose |
|---|---|
| `requestCode({ email })` | Ask for the OTP for an email |
| `verifyCode({ email, code })` | Verify the code and add/activate the account |
| `current(accountId)` | Profile of a saved account, or `null` if its session expired |
| `update(accountId, req)` | Save profile fields (name, handle, avatar, bio, status) |
| `listAccounts()` | Saved accounts + which one is active |
| `setDefault(accountId)` | Mark a saved account as the default |
| `removeAccount(accountId)` | Remove a saved account; returns the remaining list |

Results never throw: `AccountResult<T>` is `{ ok: true, data }` or
`{ ok: false, error, code? }`. The stable `AccountErrorCode`s let the UI react without parsing
messages: `invalid_input`, `invalid_code`, `handle_taken`, `rate_limited`, `network`,
`session_expired`, `api_error`, `unknown`.

Shared types live in `src/shared/account.ts`: `AccountProfile` (id, email, handle, displayName,
avatarUrl, bio, custom status), `AccountSummary` (the switcher row) and `AccountList`
(`activeId` + `accounts`). Validation rules (`ACCOUNT_RULES`) are shared so the UI can validate
for UX while main revalidates: `handle` is `/^[a-z0-9_]{3,24}$/`, `displayNameMax: 48`,
`bioMax: 160`, `avatarMaxBytes: 96_000`. The database (`validate_handle`)
normalizes the handle to lowercase and enforces the same format plus uniqueness
(`profiles_handle_lower_key`). Reserved handles are rejected unless the account is
in `public.handle_allowlist`: this includes `scrakk`, any handle containing
`scrakk`, and role words such as `admin`, `root`, `support`, `system`,
`official`, `mod` or `staff` (with optional suffixes). Official `@scrakk.art`
accounts are added to the allowlist automatically by `ensure_profile`.

## The account switcher

`AccountSwitcher` lists the saved accounts, marks the one the **current panel** uses, and
lets you switch, remove or add:

- Picking a row calls `onSwitch(id)`, which switches the panel and persists the choice with
  `account.setDefault(id)` — a remounted panel comes back on that account instead of the
  global default.
- The trash button calls `account.removeAccount(id)`; if the removed account was the panel's
  own, the panel moves to `activeId` (or the first account, or back to the login gate).
- **Add account** opens `AuthGate` with `onCancel`, i.e. the same email + code flow.

The panel state is independent: each mounted Social panel keeps its own `accountId`, so two
panels can use two accounts at once.

## How the account scopes Social and Realtime

The Social state (`SocialContext`) is keyed by the selected `accountId`:

- On mount it calls `account.listAccounts()` and picks `activeId` or the first account; when a
  panel changes account it loads `account.current(id)`, then friends, requests, presence and
  opens `social.watch(accountId)`.
- Realtime events arrive tagged with their account and are **filtered**: message, edit, delete,
  typing, request and friend handlers ignore any event whose `accountId` does not match this
  panel (`if (acc !== accountIdRef.current) return`). Two panels on two accounts stay isolated.
- Switching resets the panel's transient state (active peer, messages, unread) and the
  activity-bar badge is summed from every panel, so unread + pending requests from all accounts
  combine.

Sign-out is `social.removeAccount(accountId)` followed by a reload of the account list; with no
saved accounts the panel shows the login gate (not a loading placeholder).

## Limits

- Sign-in needs the network; a failed request surfaces the error code, not a stack.
- Sessions can expire: `account.current(id)` then returns `null` and the panel falls back to
  `AuthGate`.
- There is no password login and the renderer never receives tokens or keys (all main-side).
- This page covers the renderer-side flow only; the account backend is out of scope.

## Next steps

- [Social](social.md) — friends, direct messages and presence on top of the account.
- [Settings](settings.md) — where app preferences (separate from the account) are stored.
- [Panels & features](README.md) — the other built-in panels.
