import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { invokeTool } from "./_shared/mcp-client-core.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { data: hasAccess, error: entErr } = await userClient.rpc("can_use_mcp_client");
    if (entErr || !hasAccess) return jsonResponse({ error: "هذه الميزة غير متاحة لباقتك الحالية" }, 403);

    let body: { tool_name?: string; args?: Record<string, unknown> };
    try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

    const toolName = (body.tool_name || "").trim();
    if (!toolName) return jsonResponse({ error: "tool_name مطلوب" }, 400);

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const result = await invokeTool(adminClient, userData.user.id, toolName, body.args || {}, { requireAiEnabled: false });

    return jsonResponse(result, result.ok ? 200 : 400);
  } catch (err) {
    console.error("mcp-invoke-tool error:", err);
    return jsonResponse({ error: "حدث خطأ غير متوقع: " + (err as Error).message }, 500);
  }
});
