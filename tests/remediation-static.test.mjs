// Structural regression tests for the remediation pass.
//
// check-dns-status, sie-channel-telegram and the OAuth functions import from
// jsr:/npm:/https: specifiers that Node cannot resolve, so they are asserted
// against their source rather than executed. Each test pins one property the
// audit asked for, so a future edit that reintroduces the defect fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

// Strip `//` line comments and the env-var default, so the ".online must be
// gone" assertions look at executable code and not at the explanatory notes
// (which necessarily name both domains).
const codeOnly = (src) =>
  src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n')
    .replace(/\?\?\s*"https:\/\/mad3oom\.online"/g, '')
    .replace(/\?\?\s*"mad3oom\.online"/g, '');

function grepRepo(pattern) {
  try {
    return execFileSync('grep', [
      '-rIl', pattern, '.',
      '--exclude-dir=.git', '--exclude-dir=node_modules', '--exclude-dir=tests',
      '--exclude=_AUDIT_NOTES.md', '--exclude=DOMAIN-MIGRATION.md',
    ], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch {
    return []; // grep exits 1 on no match
  }
}

// ── Phase A: gemini-proxy removal ───────────────────────────────────────────

test('gemini-proxy source is gone', () => {
  assert.equal(existsSync(path.join(ROOT, 'supabase/functions/gemini-proxy')), false);
});

test('nothing in the repository references gemini-proxy', () => {
  assert.deepEqual(grepRepo('gemini-proxy'), [],
    'a caller reappeared — it must be removed or repointed before deploying the deletion');
});

// ── Phase D: check-dns-status authorization ─────────────────────────────────

const dns = read('supabase/functions/check-dns-status/index.ts');

test('check-dns-status requires an authenticated caller', () => {
  assert.match(dns, /supabase\.auth\.getUser\(jwt\)/);
  assert.match(dns, /غير مصرح/);
});

test('check-dns-status authorizes against the specific record (admin or owner)', () => {
  assert.match(dns, /const isAdmin = callerProfile\?\.role === "admin"/);
  assert.match(dns, /const isOwner = row\.user_id === callerId/);
  assert.match(dns, /if \(!isAdmin && !isOwner\)/);
});

test('check-dns-status introduces no new role', () => {
  const roles = [...dns.matchAll(/role\s*===\s*"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(roles)], ['admin']);
});

test('check-dns-status still performs the real HTTPS verification', () => {
  assert.match(dns, /method: "HEAD"/);
  assert.match(dns, /isDomainResponding/);
});

test('check-dns-status guards the transition so polling cannot double-notify', () => {
  assert.match(dns, /\.eq\("status", "propagating"\)/,
    'the UPDATE must be conditional on the prior status');
  assert.match(dns, /updated && updated\.length > 0/,
    'the notification must depend on this request being the one that transitioned the row');
});

test('both check-dns-status callers send an Authorization header', () => {
  for (const page of ['subdomains/create-subdomain.html', 'subdomains/manage-subdomains.html']) {
    const src = read(page);
    const call = src.slice(src.indexOf('fetch(CHECK_DNS_FN_URL'));
    const block = call.slice(0, call.indexOf('});') + 3);
    assert.match(block, /Authorization/, `${page} must authenticate its check-dns-status call`);
  }
});

// ── Phase E: sie-channel-telegram GET authorization ─────────────────────────

const sie = read('supabase/functions/sie-channel-telegram/index.remote.ts');

test('sie-channel-telegram GET is admin-gated', () => {
  assert.match(sie, /if \(req\.method === 'GET'\) \{\s*\n\s*if \(!await isAdminCaller\(req\)\)/,
    'the admin check must be the first thing the GET branch does');
  assert.match(sie, /status: 401/);
});

test('sie-channel-telegram admin check reads a real session and the admin role', () => {
  assert.match(sie, /supabase\.auth\.getUser\(jwt\)/);
  assert.match(sie, /profile\?\.role === 'admin'/);
});

test('autoRegisterWebhook is only reachable from the gated self-check', () => {
  const calls = [...sie.matchAll(/await autoRegisterWebhook\(/g)];
  assert.equal(calls.length, 1, 'exactly one call site');
  const idx = sie.indexOf('await autoRegisterWebhook(');
  const fnStart = sie.lastIndexOf('async function selfCheck', 0 + idx);
  assert.ok(fnStart !== -1 && fnStart < idx, 'its only call site is inside selfCheck()');
});

test('the Telegram POST webhook path is unchanged', () => {
  assert.match(sie, /if \(!BOT_TOKEN \|\| !WEBHOOK_SECRET\) \{/);
  assert.match(sie, /return new Response\('misconfigured', \{ status: 500 \}\)/);
  assert.match(sie, /await handleInbound\(\{/);
  assert.match(sie, /result\.status === 'unverified'/);
  // Telegram must still get a 200 on internal failure so it does not retry.
  assert.match(sie, /logger\.error\('the webhook threw'[\s\S]*?return new Response\('ok', \{ status: 200 \}\)/);
});

// ── Phase C: verify-2fa (structure; behaviour is covered by verify-2fa.test.mjs)

const twofa = read('supabase/functions/verify-2fa/index.ts');

test('verify-2fa never decodes the TOTP from the request body directly', () => {
  assert.match(twofa, /base32Decode\(secretToVerify\)/);
  assert.doesNotMatch(twofa, /base32Decode\(tempSecret\)/);
});

test('verify-2fa resolves identity through GoTrue, not an unverified claim', () => {
  assert.match(twofa, /auth\/v1\/user/);
  assert.doesNotMatch(twofa, /getUserIdFromJWT/, 'the unverified decoder should be gone');
});

test('verify-2fa scopes the secret lookup to the authenticated user', () => {
  assert.match(twofa, /profiles\?id=eq\.\$\{userId\}/);
});

// ── Phase B: the legacy plaintext WhatsApp path is untouched, on purpose ────

test('whatsapp-graph-request legacy plaintext fallback is still present (Phase B is blocked)', () => {
  const p = 'supabase/functions/whatsapp-graph-request/index.ts';
  if (!existsSync(path.join(ROOT, p))) return; // not mirrored locally
  assert.match(read(p), /TODO\(token-migration\)/,
    'Phase B was deliberately not executed; removing this needs the usage evidence first');
});

// ── Phase F: domain migration readiness ─────────────────────────────────────

const ORIGIN_FILES = [
  'supabase/functions/oauth-discovery/index.ts',
  'supabase/functions/oauth-protected-resource/index.ts',
  'supabase/functions/oauth-authorize/index.ts',
  'supabase/functions/mcp-oauth-callback/index.ts',
];

test('every OAuth origin is read from one variable', () => {
  for (const f of ORIGIN_FILES) {
    assert.match(read(f), /Deno\.env\.get\("PUBLIC_SITE_ORIGIN"\)/, `${f} must read PUBLIC_SITE_ORIGIN`);
  }
});

test('the default keeps today behaviour exactly, so deploying is a no-op', () => {
  for (const f of ORIGIN_FILES) {
    assert.match(read(f), /\?\?\s*"https:\/\/mad3oom\.online"/, `${f} must default to the current origin`);
  }
});

test('no OAuth function still hard-codes a .online URL', () => {
  for (const f of ORIGIN_FILES) {
    assert.doesNotMatch(codeOnly(read(f)), /mad3oom\.online/,
      `${f} has a .online literal in code outside the env default`);
  }
});

test('the OAuth issuer and the metadata endpoints move together', () => {
  const disc = read('supabase/functions/oauth-discovery/index.ts');
  assert.match(disc, /const issuer = PUBLIC_SITE_ORIGIN;/);
  for (const ep of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) {
    assert.match(disc, new RegExp(`${ep}: \\\`\\$\\{issuer\\}`), `${ep} must derive from the issuer`);
  }
  assert.match(disc, /service_documentation: issuer/);
});

test('the subdomain root domain is env-driven and defaults to today value', () => {
  for (const f of ['supabase/functions/create-subdomain/index.ts',
                   'supabase/functions/request-subdomain/index.ts']) {
    const src = read(f);
    assert.match(src, /Deno\.env\.get\("SUBDOMAIN_ROOT_DOMAIN"\) \?\? "mad3oom\.online"/, f);
    assert.doesNotMatch(codeOnly(src), /mad3oom\.online/,
      `${f} still has a hard-coded .online literal in code`);
  }
});

test('the operational migration checklist is committed alongside the code', () => {
  const doc = read('docs/DOMAIN-MIGRATION.md');
  for (const marker of ['PUBLIC_SITE_ORIGIN', 'SUBDOMAIN_ROOT_DOMAIN', 'Cloudflare', 'Vercel',
                        'teha.mad3oom.online', 'admins.mad3oom.online']) {
    assert.ok(doc.includes(marker), `checklist must cover ${marker}`);
  }
});

// ── Deferred items must remain untouched ────────────────────────────────────

test('explicitly deferred functions were not modified', () => {
  const deferred = [
    'supabase/functions/check-subdomain-status/index.ts',
    'supabase/functions/send-ticket-email/index.ts',
    'supabase/functions/landing-contact/index.ts',
  ];
  const changed = execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  for (const f of deferred) {
    assert.ok(!changed.includes(f), `${f} is on the deferred list and must not change`);
  }
});

test('admin-fix-webhook-subscription is still not mirrored (its token stays out of git)', () => {
  assert.equal(existsSync(path.join(ROOT, 'supabase/functions/admin-fix-webhook-subscription')), false);
  assert.deepEqual(grepRepo('mad3oom-wa-fix'), []);
});
