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
- Business modes are registered in `src/lib/modes.ts` (MODES); per-account access lives in `account_modes`, enforced in `_authenticated/route.tsx`. Why: new modes need one line, not new role types.
- Device gate (初期認証) is verified server-side (`src/lib/gate.functions.ts`, `app_gate` table, server-only); a HMAC token is kept in localStorage. Why: iframe-safe and survives without re-entry.
- Purchase protected fields/status are enforced by the `purchases_guard` DB trigger and delegated permissions; delivered_on set => status delivered. Why: UI can't bypass permissions.
- Fine-grained permissions are "mode.action" keys in `account_modes`, declared as `perms` on MODES in `src/lib/modes.ts`; DB checks use `has_perm()`. Why: new features add permissions without schema changes.
- Purchase reads use the permission-aware `purchase_rows` projection; protected field writes and file imports use checked database functions/triggers. Why: hidden fields must not reach unauthorized browsers, while existing records stay unchanged.
- Purchase tables share a viewport-bottom native horizontal track. Why: wide tables remain navigable without scrolling to their last row.
- Purchase numbers live in `purchase_admin_fields` with restricted direct access and permission-checked projections/functions; 発注検収 edits the same `purchases` rows. Why: delegated estimate access does not expose inspection-only numbers or create double bookkeeping.
- Purchase photo attachments reference storage paths in `purchase_attachments`; URLs are signed server-side after an RLS visibility check. Why: existing photos are reused without copying.
