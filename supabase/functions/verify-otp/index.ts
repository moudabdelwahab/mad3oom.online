import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { userId, otp } = await req.json()
    const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for") || "unknown"
    const userAgent = req.headers.get("user-agent") || "unknown"

    if (!userId || !otp) {
      return new Response(JSON.stringify({ success: false, message: "Missing data" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const otpHash = await hashString(otp)

    const { data: otpData, error: otpError } = await supabase
      .from("admin_telegram_otps")
      .select("*")
      .eq("user_id", userId)
      .eq("otp_hash", otpHash)
      .eq("is_used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (otpError || !otpData) {
      await supabase.rpc("increment_otp_attempts", { target_user_id: userId })

      return new Response(JSON.stringify({ success: false, message: "رمز التحقق غير صحيح أو انتهت صلاحيته" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      })
    }

    if (otpData.attempts >= 5) {
      return new Response(JSON.stringify({ success: false, message: "تم تجاوز عدد المحاولات المسموح بها" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      })
    }

    await supabase
      .from("admin_telegram_otps")
      .update({ is_used: true, ip_address: ip, user_agent: userAgent })
      .eq("id", otpData.id)

    await supabase.from("telegram_auth_logs").insert({
      user_id: userId,
      action: "otp_verified",
      ip_address: ip,
      user_agent: userAgent
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })

  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})

async function hashString(str: string) {
  const msgUint8 = new TextEncoder().encode(str)
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
