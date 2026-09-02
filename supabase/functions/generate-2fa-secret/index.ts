// ✅ لا يوجد أي استيراد خارجي هنا

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function generateBase32Secret(byteLength = 20): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  let bits = "";
  for (const b of bytes) {
    bits += b.toString(2).padStart(8, "0");
  }

  let base32 = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    base32 += BASE32_ALPHABET[parseInt(bits.substring(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder !== 0) {
    const chunk = bits.substring(bits.length - remainder).padEnd(5, "0");
    base32 += BASE32_ALPHABET[parseInt(chunk, 2)];
  }

  return base32;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const base32 = generateBase32Secret(20);
    const issuer = "Mad3oom.online";
    const label = "2FA";

    const otpauth_url =
      `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}` +
      `?secret=${base32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

    return new Response(
      JSON.stringify({ base32, otpauth_url }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("generate-2fa-secret error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
