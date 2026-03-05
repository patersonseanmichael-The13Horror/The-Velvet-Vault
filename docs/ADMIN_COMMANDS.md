# Velvet Vault — Admin Commands Reference

This document describes every admin callable function available in the Velvet Vault Firebase backend. All callables require the `admin` custom claim (`token.admin === true`) on the authenticated user. Attempts by non-admin users are logged as `admin_misuse_attempt` with `severity: critical`.

---

## Access

The Admin Console is available at `/admin.html`. The link appears in the hamburger navigation menu only for users whose Firebase ID token carries the `admin: true` custom claim.

To grant admin access to a user, use the Firebase Admin SDK or the Firebase console to set the custom claim:

```js
admin.auth().setCustomUserClaims(uid, { admin: true });
```

---

## Wallet Operations

### `adminCredit`

Credits a user's cash balance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | string | Target user UID |
| `amountCents` | number | Amount in cents (positive integer) |
| `reason` | string | Audit reason (e.g. `manual_credit`) |

---

### `adminDebit`

Debits a user's cash balance. Will fail if the balance is insufficient.

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | string | Target user UID |
| `amountCents` | number | Amount in cents (positive integer) |
| `reason` | string | Audit reason (e.g. `manual_debit`) |

---

### `adminSetBalance`

Forcibly sets a user's cash balance to an exact amount. Use with caution.

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | string | Target user UID |
| `amountCents` | number | New balance in cents |
| `reason` | string | Audit reason |

---

### `adminFreeze`

Freezes or unfreezes a user account. Frozen accounts cannot place bets or make withdrawals.

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | string | Target user UID |
| `freeze` | boolean | `true` to freeze, `false` to unfreeze |

---

### `adminGetUserLedger`

Retrieves a user's wallet ledger entries.

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | string | Target user UID |
| `limit` | number | Max entries to return (default 50, max 200) |

---

## Deposit & Withdrawal Requests

### `adminListPendingDepositRequests`

Lists all pending deposit requests.

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max entries (default 50) |

---

### `adminListPendingWithdrawalRequests`

Lists all pending withdrawal requests.

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max entries (default 50) |

---

### `adminApproveDepositRequest`

Approves a deposit request and credits the user's wallet.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Deposit request document ID |

---

### `adminApproveWithdrawalRequest`

Approves a withdrawal request and debits the user's wallet.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Withdrawal request document ID |

---

### `adminRejectDepositRequest`

Rejects a deposit request.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Deposit request document ID |
| `reason` | string | Optional rejection reason |

---

### `adminRejectWithdrawalRequest`

Rejects a withdrawal request.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Withdrawal request document ID |
| `reason` | string | Optional rejection reason |

---

## Sentry System

The Sentry system provides automated risk scoring and AI-assisted review recommendations.

### `adminSentryEvaluateUser`

Runs a risk evaluation on a user and persists the result to `sentryFlags/{uid}` if the score is 30 or above.

**Risk factors evaluated:**

| Factor | Score Added |
|--------|-------------|
| Duplicate phone number (multiple accounts) | +40 |
| 3+ deposit requests in 24 hours | +20 |
| 2+ rejected deposit requests | +15 |
| Account currently frozen | +25 |
| 3+ withdrawal requests in 24 hours | +20 |

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | string | Target user UID |

**Returns:** `{ ok, uid, riskScore, flags, reason }`

---

### `adminSentryListFlagged`

Lists users with persisted sentry flags, ordered by risk score descending.

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max entries (default 50, max 200) |
| `minScore` | number | Minimum risk score filter (0–100) |

**Returns:** `{ ok, entries: [{ uid, riskScore, flags, reason, updatedAt }] }`

---

### `adminDepositAssist`

Runs a risk evaluation on a specific deposit request and returns an AI-assisted recommendation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Deposit request document ID |

**Returns:** `{ ok, id, uid, amountCents, status, createdAt, riskScore, flags, recommendation, proofImageUrl }`

**Recommendation values:**
- `APPROVE` — low risk, proof present
- `REVIEW — moderate risk, verify proof manually`
- `REJECT — high risk score`
- `REVIEW — no proof image attached`

---

### `adminWithdrawAssist`

Runs a risk evaluation on a specific withdrawal request and returns an AI-assisted recommendation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Withdrawal request document ID |

**Returns:** `{ ok, id, uid, amountCents, status, createdAt, riskScore, flags, recommendation, payoutDetails }`

---

## Security Notes

- All admin callables verify `context.auth?.token?.admin === true` before executing.
- All misuse attempts (unauthenticated or non-admin) are logged to `systemLogs` with `severity: critical` and type `admin_misuse_attempt`.
- The admin page (`admin.html`) is protected by `guard.js` via `<meta name="vv-protected" content="true">` and additionally checks the admin custom claim client-side before rendering any data.
- The `sentryFlags` and `system_logs` Firestore collections are read-only for admin users via security rules; no client can write to them directly.

---

## Audit Trail

Every admin action is logged to the `systemLogs` Firestore collection with:

- `type` — action type (e.g. `admin_credit`, `admin_freeze`, `admin_sentry_evaluate`)
- `uid` — the admin user who performed the action
- `message` — human-readable description
- `severity` — `info`, `warn`, or `critical`
- `meta` — action-specific metadata
- `createdAt` — server timestamp

---

*Last updated: March 2026*
