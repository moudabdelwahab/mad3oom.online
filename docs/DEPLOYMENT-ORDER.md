# Deployment order for branch `claude/mad3oom-tenancy-audit-erywvm`

**Nothing on this branch has been deployed or applied.** Some changes only work
if their pieces ship together. Each unit below is atomic: ship all of it, or
none of it.

---

## Unit 1 — 2FA bypass closure  ⚠️ the security fix that is not yet live

Until **all three** parts land, an attacker holding only the password can still
disable 2FA through PostgREST while standing at the login challenge.

| # | Artifact | Action |
|---|---|---|
| 1 | `supabase/functions/disable-2fa/` | deploy **first** |
| 2 | `migrations/006_2fa_change_requires_challenge.sql` | apply **second** |
| 3 | `2fa-service.js`, `customer-settings-modal.js`, `customer-security-settings.html`, `admin-security-settings.html` | publish **third** |

**Order matters.** The trigger (2) makes the browser's old disable path fail, so
the function (1) must already exist and the pages (3) must follow immediately.
Applying (2) alone leaves users unable to turn 2FA off at all.

Rollback: `DROP TRIGGER enforce_2fa_change_requires_challenge ON public.profiles;`
The function and pages keep working without it — they just stop being the only way.

Verify after: enroll, disable with an authenticator code, disable with a
recovery code, and confirm a direct
`PATCH /rest/v1/profiles?id=eq.<self>` with `{"two_factor_enabled":false}`
returns an error for a signed-in user.

---

## Unit 2 — check-dns-status authorization

| Artifact | Action |
|---|---|
| `supabase/functions/check-dns-status/` | deploy together |
| `subdomains/create-subdomain.html`, `subdomains/manage-subdomains.html` | publish together |

The function starts requiring a session in the same moment the pages start
sending one. Deploy the function first and DNS propagation polling breaks in the
live admin creation flow. Publish the pages first and nothing breaks — they send
a header the old function ignores — so **pages first is the safe order** if they
cannot be simultaneous.

---

## Unit 3 — gemini-proxy removal

Deleting the deployed `gemini-proxy` function has no code dependency: the repo
carries zero references and the last 24h of invocation logs show none. It can be
removed from the Supabase dashboard at any time, independently.

---

## Unit 4 — sie-channel-telegram GET gate

`supabase/functions/sie-channel-telegram/index.ts` deploys alone. No frontend
consumes the GET self-check. After deploying, an anonymous `GET` must return
401; the Telegram `POST` webhook must keep delivering.

---

## Unit 5 — domain migration

Governed entirely by `docs/DOMAIN-MIGRATION.md`. The code defaults preserve
`.online`, so these functions may be deployed at any time with no behaviour
change; only setting `PUBLIC_SITE_ORIGIN` / `SUBDOMAIN_ROOT_DOMAIN` cuts over.

---

## Placeholder Supabase keys (fixed on this branch, no coupling)

`subdomains/manage-subdomains.html` and `request-subdomain.html` shipped
`REPLACE_WITH_YOUR_SUPABASE_ANON_KEY` verbatim — there is no build step or
substitution mechanism in this repo (`vercel.json` contains only rewrites; the
sole workflow is CodeQL; sibling pages hard-code their keys inline). Both now
carry the same public **anon** key already committed in
`subdomains/create-subdomain.html`. No service-role secret is involved and
nothing was rotated.
