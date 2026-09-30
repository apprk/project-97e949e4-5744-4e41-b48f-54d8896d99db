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
- Purchase admin-only fields/status are enforced by the `purchases_guard` DB trigger; delivered_on set => status delivered. Why: UI can't bypass permissions.
