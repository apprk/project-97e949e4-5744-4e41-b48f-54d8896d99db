<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Maintenance editing uses additive repair fields and preserves legacy fields; next timing is derived in a shared calendar-date module from scheduled dates and dated history. Why: past entries and old cached next dates must not change the latest-completion calculation.
- Maintenance account visibility and equipment-name masters use admin-only configuration tables; history attachments reference history IDs and optional existing photo IDs, with RLS-checked server signing following current photo paths. Why: display changes and attachments must not erase values or alter source photographs.
- Maintenance page sections live in focused components under components/maintenance with paginated reads. Why: continuous entry, planning and per-history photo flows stay independently maintainable without changing unrelated routes.
- Schedule reads and import matching use stable paginated reads; Excel dates retain their raw year and imports verify returned writes and readback without deleting existing duplicate rows. Why: Data API limits and formatted date cells must not hide later years or create more duplicates.
- Business modes are registered in `src/lib/modes.ts` (MODES); per-account access lives in `account_modes`, enforced in `_authenticated/route.tsx`. Why: new modes need one line, not new role types.
- Device gate (初期認証) is verified server-side (`src/lib/gate.functions.ts`, `app_gate` table, server-only); a HMAC token is kept in localStorage. Why: iframe-safe and survives without re-entry.
- Purchase protected fields/status are enforced by the `purchases_guard` DB trigger and delegated permissions; delivered_on set => status delivered. Why: UI can't bypass permissions.
- Fine-grained permissions are "mode.action" keys in `account_modes`, declared as `perms` on MODES in `src/lib/modes.ts`; DB checks use `has_perm()`. Why: new features add permissions without schema changes.
- Purchase reads use the permission-aware `purchase_rows` projection; protected field writes and file imports use checked database functions/triggers. Why: hidden fields must not reach unauthorized browsers, while existing records stay unchanged.
- Purchase tables share a viewport-bottom native horizontal track. Why: wide tables remain navigable without scrolling to their last row.
- Purchase history and inspection share written-date period logic and date controls; initial bottom positioning is owned by each screen and references its native list container. Why: fiscal/custom ranges remain consistent and later edits or filters never reset scrolling.
- Purchase numbers live in `purchase_admin_fields` with restricted direct access and permission-checked projections/functions; 発注検収 edits the same `purchases` rows. Why: delegated estimate access does not expose inspection-only numbers or create double bookkeeping.
- Supplier commits use the latest input value, and inspection saves preserve trigger-derived vendor numbers whenever the supplier changes. Why: delayed blur callbacks and stale drafts must not undo automatic synchronization.
- Purchase analytics aggregate the permission-aware projection in a shared pure delivery-date module and distinguish fetch failures, unpriced records and empty periods. Why: periods and totals must be testable without inventing dates or hiding read failures.
- Purchase photo attachments reference storage paths in `purchase_attachments`; URLs are signed server-side after an RLS visibility check. Why: existing photos are reused without copying.
- Administrator authentication uses server-verified passwords, migration markers and JWT-session-bound expiring grants; is_admin checks these grants after migration. Why: hidden navigation and browser storage are not authorization boundaries.
- Administrator secrets are stored only by Auth, never in account_pins; the legacy PIN is accepted solely to authenticate first-time password migration. Why: preserve access while preventing PIN fallback after migration.
- First administrator setup requires explicit server opt-in, a verified device gate, and a service-only database claim; no business access is granted before chosen credentials are saved. Why: fresh installations can initialize without opening existing administrators to credential-free access.
