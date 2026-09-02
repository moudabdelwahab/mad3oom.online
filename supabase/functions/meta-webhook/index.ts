// supabase/functions/meta-webhook/index.ts
// Webhook Handler: استقبال تحديثات حالة القوالب من Meta

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ─── Webhook Verification (GET) ──────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === Deno.env.get("WEBHOOK_VERIFY_TOKEN")) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ─── استقبال Events (POST) ────────────────────────────────────────
  if (req.method === "POST") {
    const rawBody = await req.text();

    // التحقق من توقيع Meta
    const appSecret = Deno.env.get("META_APP_SECRET");
    if (appSecret) {
      const signature = req.headers.get("x-hub-signature-256");
      if (!signature) {
        return new Response("Missing signature", { status: 401 });
      }
      const expectedSig = "sha256=" + await computeHmac(appSecret, rawBody);
      if (signature !== expectedSig) {
        console.error("Invalid webhook signature");
        return new Response("Invalid signature", { status: 401 });
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // ─── معالجة كل entry ──────────────────────────────────────────
    for (const entry of payload?.entry || []) {
      for (const change of entry?.changes || []) {
        // تحديثات القوالب تجي في field: "message_template_status_update"
        if (change.field === "message_template_status_update") {
          await handleTemplateStatusUpdate(supabase, change.value);
        }

        // يمكن إضافة handlers أخرى هنا (رسائل واردة، إيصالات، إلخ)
        // if (change.field === "messages") { ... }
      }
    }

    // Meta بتحتاج 200 سريع
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});

// ─── معالجة تحديث حالة القالب ────────────────────────────────────
async function handleTemplateStatusUpdate(
  supabase: ReturnType<typeof createClient>,
  value: any
) {
  console.log("Template status update:", JSON.stringify(value));

  const {
    message_template_id,
    message_template_name,
    event,        // APPROVED | REJECTED | PENDING | DISABLED | PAUSED
    reason,       // سبب الرفض (لو موجود)
    new_quality_score, // درجة الجودة
  } = value;

  if (!message_template_id && !message_template_name) {
    console.warn("No template ID or name in webhook payload");
    return;
  }

  // تحويل event لـ status
  const statusMap: Record<string, string> = {
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    PENDING_DELETION: "PENDING_DELETION",
    DISABLED: "DISABLED",
    PAUSED: "PAUSED",
    IN_APPEAL: "IN_APPEAL",
  };
  const newStatus = statusMap[event] || event;

  // ─── تحديث في Supabase ────────────────────────────────────────
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };

  if (reason) updateData.rejection_reason = reason;
  if (new_quality_score) updateData.quality_score = new_quality_score;
  if (event === "APPROVED") updateData.approved_at = new Date().toISOString();
  if (event === "REJECTED") updateData.rejected_at = new Date().toISOString();

  // البحث بـ meta_template_id أو الاسم
  let query = supabase
    .from("whatsapp_templates")
    .update(updateData);

  if (message_template_id) {
    query = query.eq("meta_template_id", message_template_id.toString());
  } else {
    query = query.eq("name", message_template_name);
  }

  const { error, count } = await query;

  if (error) {
    console.error("Failed to update template status:", error);
    return;
  }

  console.log(`Template ${message_template_name || message_template_id} → ${newStatus} (updated ${count} rows)`);

  // ─── تسجيل في جدول audit_log ─────────────────────────────────
  await supabase.from("template_status_logs").insert({
    meta_template_id: message_template_id?.toString(),
    template_name: message_template_name,
    old_event: event,
    new_status: newStatus,
    reason: reason || null,
    quality_score: new_quality_score || null,
    raw_payload: value,
    created_at: new Date().toISOString(),
  });
}

// ─── حساب HMAC-SHA256 ─────────────────────────────────────────────
async function computeHmac(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
