// ✅ لا يوجد أي imports خارجية — TOTP مكتوب بالكامل + Rate Limiting حقيقي
// ضد محاولات التخمين المتكررة للكود

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 10;
const LOCK_MINUTES = 15;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(base32: string): Uint8Array {
  const cleaned = base32.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
  let bits = "";
  for (const char of cleaned) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function generateTOTP(secretBytes: Uint8Array, counter: number): Promise<string> {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter % 0x100000000);

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binCode % 1000000).toString().padStart(6, "0");
}

function getUserIdFromJWT(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    return payload.sub || null;
  } catch {
    return null;
  }
}

async function getRateLimit(userId: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/twofa_rate_limits?user_id=eq.${userId}&select=*`,
    {
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
    }
  );
  const rows = await res.json();
  return rows?.[0] || null;
}

async function upsertRateLimit(userId: string, patch: Record<string, unknown>) {
  await fetch(`${SUPABASE_URL}/rest/v1/twofa_rate_limits`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ user_id: userId, ...patch }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const userId = getUserIdFromJWT(authHeader);

    if (!userId) {
      return new Response(
        JSON.stringify({ verified: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { code, tempSecret } = await req.json();

    if (!code || !tempSecret) {
      return new Response(
        JSON.stringify({ verified: false, error: "Missing code or secret" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ══════════ Rate Limiting ══════════
    const now = Date.now();
    let rateLimit = await getRateLimit(userId);

    if (rateLimit?.locked_until && new Date(rateLimit.locked_until).getTime() > now) {
      const retryAfterSec = Math.ceil(
        (new Date(rateLimit.locked_until).getTime() - now) / 1000
      );
      return new Response(
        JSON.stringify({
          verified: false,
          error: "too_many_attempts",
          retry_after_seconds: retryAfterSec,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // نافذة المحاولات انتهت صلاحيتها؟ نبدأ من جديد
    let failedAttempts = rateLimit?.failed_attempts ?? 0;
    const windowStart = rateLimit?.window_start
      ? new Date(rateLimit.window_start).getTime()
      : 0;
    if (now - windowStart > WINDOW_MINUTES * 60 * 1000) {
      failedAttempts = 0;
    }

    // ══════════ التحقق من الكود ══════════
    const secretBytes = base32Decode(tempSecret);
    const period = 30;
    const currentCounter = Math.floor(now / 1000 / period);

    let verified = false;
    for (let errorWindow = -1; errorWindow <= 1; errorWindow++) {
      const otp = await generateTOTP(secretBytes, currentCounter + errorWindow);
      if (otp === code) {
        verified = true;
        break;
      }
    }

    if (verified) {
      await upsertRateLimit(userId, {
        failed_attempts: 0,
        window_start: new Date().toISOString(),
        locked_until: null,
      });
    } else {
      failedAttempts += 1;
      const patch: Record<string, unknown> = {
        failed_attempts: failedAttempts,
        window_start: new Date(windowStart && now - windowStart <= WINDOW_MINUTES * 60 * 1000 ? windowStart : now).toISOString(),
      };
      if (failedAttempts >= MAX_ATTEMPTS) {
        patch.locked_until = new Date(now + LOCK_MINUTES * 60 * 1000).toISOString();
      }
      await upsertRateLimit(userId, patch);
    }

    return new Response(
      JSON.stringify({ verified }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-2fa error:", err);
    return new Response(
      JSON.stringify({ verified: false, error: "Internal Server Error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
