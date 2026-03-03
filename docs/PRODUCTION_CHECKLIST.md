# Production Checklist

## Concurrency
- Run one normal spin and confirm exactly one reserve, one `/spin`, and one settle request.
- Spam the spin button rapidly and confirm client-side `spinInProgress` blocks duplicate launches.
- Reuse the same `spinSessionId` and confirm the slot server rejects it.
- Retry settle with the same `spinSessionId` and confirm Functions rejects the duplicate settle.

## Rapid Spin Safety
- Run 100 rapid spins against a test user.
- Confirm no negative locked balance.
- Confirm no duplicate win settlement for a single spin session.
- Confirm rate limiting blocks excessive reserve attempts and creates `systemLogs` entries.

## Withdrawal Caps
- Cash-only wallet: confirm withdrawals above `$200,000.00` are rejected.
- Bonus-active wallet: confirm withdrawals above `$3,000.00` are rejected.
- Confirm cap violations write `systemLogs` entries with critical or warning severity.

## Bonus / Rollover
- Place one bet and confirm `rolloverProgressCents` increments once on reserve.
- Confirm settle does not increment rollover again.
- Confirm bonus lock remains active until `rolloverProgressCents >= rolloverTargetCents`.

## Emulator Steps
- `cd functions`
- `npm run build`
- `npm run lint`
- `npm run serve`
- In an authenticated browser session:
  - call `vvCreateDepositRequest`
  - call `vvCreateWithdrawalRequest`
  - confirm non-admin approval attempts fail
  - confirm admin approval succeeds

## Render / Hybrid Checks
- Confirm `https://velvet-vault.onrender.com/health` returns `{"status":"ok"}`.
- Confirm `window.VV_SLOT_SERVER_URL === "https://velvet-vault.onrender.com"`.
- Confirm slot server rejects missing `Authorization` headers.
- Confirm slot server rejects duplicate `spinSessionId` values.

## Frontend
- Open `members.html`, `slots.html`, and `admin.html`.
- Confirm no layout shift when wallet history loads.
- Confirm wallet modal keeps the page locked with no body scroll shift.
- Confirm reels remain clipped and no z-index bleed appears above the modal.
