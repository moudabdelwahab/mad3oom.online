import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export interface RegistryTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  enabled?: boolean;
  visible?: boolean;
  ai_enabled?: boolean;
  priority?: number;
  require_confirmation?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ResolvedTool {
  server: { id: string; name: string; transport: string; url: string | null; command?: string | null; headers?: Record<string, unknown> | null; connector_type?: string };
  connection: Record<string, any>;
  tool: RegistryTool;
}

/** كل الأدوات المتاحة لمالك معيّن عبر كل خوادمه المتصلة - لا يوجد أي استعلام عالمي.
 *  connector_type مضافة للـ select فقط (v2) - oauth_connector ريور dead-code طبيعي هنا لأن
 *  tools دايمًا [] لهم بعد test-mcp-server الجديد، لكن الحقل موجود لما تتطور Adapters. */
export async function listToolsForOwner(adminClient: SupabaseClient, ownerId: string): Promise<ResolvedTool[]> {
  if (!ownerId) return [];

  const { data: connections, error } = await adminClient
    .from("mcp_server_connections")
    .select("*, mcp_servers!inner(id, name, transport, url, command, headers, enabled, connector_type)")
    .eq("owner_id", ownerId)
    .eq("status", "connected");
  if (error || !connections) return [];

  const out: ResolvedTool[] = [];
  for (const conn of connections as any[]) {
    const server = conn.mcp_servers;
    if (!server?.enabled) continue;
    const tools: RegistryTool[] = Array.isArray(conn.tools) ? conn.tools : [];
    for (const tool of tools) out.push({ server, connection: conn, tool });
  }
  return out;
}

export async function resolveTool(
  adminClient: SupabaseClient,
  ownerId: string,
  toolName: string,
  opts: { requireAiEnabled?: boolean } = {}
): Promise<ResolvedTool | null> {
  const all = await listToolsForOwner(adminClient, ownerId);
  const candidates = all.filter((t) => t.tool.name === toolName);
  if (!candidates.length) return null;

  const eligible = candidates.filter((t) => {
    if (t.tool.enabled === false) return false;
    if (opts.requireAiEnabled && t.tool.ai_enabled !== true) return false;
    return true;
  });
  if (!eligible.length) return null;

  eligible.sort((a, b) => (a.tool.priority ?? 100) - (b.tool.priority ?? 100));
  return eligible[0];
}

export async function listAiEnabledToolsForOwner(adminClient: SupabaseClient, ownerId: string): Promise<ResolvedTool[]> {
  const all = await listToolsForOwner(adminClient, ownerId);
  return all
    .filter((t) => t.tool.enabled !== false && t.tool.ai_enabled === true)
    .sort((a, b) => (a.tool.priority ?? 100) - (b.tool.priority ?? 100));
}
