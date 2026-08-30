import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ============================================================
// accounting-sync
// ------------------------------------------------------------
// جسر بين منصة مدعوم والنظام المحاسبي (مشروع Supabase منفصل).
// ثلاث مراحل في كل تشغيل:
//
//   1. customers — كل profile له اشتراك يصير عميلاً في المحاسبة،
//      مربوطاً بـ external_id = profiles.id.
//   2. invoices  — كل اشتراك مؤكَّد (active/expired) ينتج فاتورة
//      واحدة. السعر من كتالوج service_plans في المحاسبة، لأن
//      whatsapp_subscriptions لا تحمل مبلغاً.
//   3. outbox    — الفواتير الصادرة تُسجَّل هنا وتُضاف داخل التذكرة
//      كرد مرفق، ثم يُكتب رابطها العام في المحاسبة ليُطبع كـ QR.
//
// كل مرحلة قابلة لإعادة التشغيل بأمان: التكرار محكوم بفهارس فريدة
// على الطرفين (customers.external_id و invoices.external_subscription_id
// و accounting_invoices.external_invoice_id).
//
// الأسرار المطلوبة:
//   ACCOUNTING_URL          عنوان مشروع المحاسبة
//   ACCOUNTING_SERVICE_KEY  مفتاح service_role الخاص به
//   SYNC_SECRET             سر بسيط لحماية استدعاء هذه الدالة
// ============================================================

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/**
 * تفاصيل الخطأ تخص المشغّل لا المتصل: تُكتب في سجل الدالة، ويعود
 * للمتصل وصف عام مع requestId يربط الرد بالسجل. الرد لا يحمل رسائل
 * قواعد البيانات ولا أجسام ردود الخدمات الخارجية.
 */
function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function logFailure(requestId: string, scope: string, err: unknown): void {
  console.error(`[accounting-sync ${requestId}] ${scope}:`, err);
}

/** الاشتراكات التي تستحق فاتورة. المرفوضة لا تُفوتر. */
const BILLABLE_STATUSES = ["active", "expired"];

type Json = Record<string, unknown>;

/** نداء REST على مشروع المحاسبة بمفتاح service_role. */
async function accounting(
  path: string,
  init: RequestInit & { url: string; key: string },
): Promise<Response> {
  const { url, key, ...rest } = init;
  return await fetch(`${url}/rest/v1/${path}`, {
    ...rest,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
  });
}

async function readJson(res: Response, label: string): Promise<Json[]> {
  if (!res.ok) {
    // جسم الرد قد يحمل تفاصيل داخلية، فيُسجَّل ولا يُرفع مع الاستثناء
    console.error(`[accounting-sync] ${label} HTTP ${res.status}:`, (await res.text()).slice(0, 500));
    throw new Error(`${label}: HTTP ${res.status}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const syncSecret = Deno.env.get("SYNC_SECRET");
  if (!syncSecret || req.headers.get("x-sync-secret") !== syncSecret) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const acctUrl = Deno.env.get("ACCOUNTING_URL");
  const acctKey = Deno.env.get("ACCOUNTING_SERVICE_KEY");
  if (!acctUrl || !acctKey) {
    return jsonResponse({ error: "ACCOUNTING_URL / ACCOUNTING_SERVICE_KEY غير مضبوطين" }, 500);
  }
  const acct = { url: acctUrl, key: acctKey };

  const mad3oom = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const requestId = crypto.randomUUID();

  const report = {
    customers_synced: 0,
    invoices_created: 0,
    invoices_skipped: 0,
    outbox_delivered: 0,
    /** أحداث فشل تسليمها — المعرّفات فقط؛ السبب في سجل الدالة. */
    failed_event_ids: [] as string[],
    /** باقات في الاشتراكات بلا مقابل في كتالوج المحاسبة. */
    unknown_plans: [] as string[],
  };

  try {
    // ---------- 1) العملاء ----------
    const { data: subs, error: subsErr } = await mad3oom
      .from("whatsapp_subscriptions")
      .select("id, user_id, ticket_id, plan, billing_cycle, status, start_date, end_date")
      .in("status", BILLABLE_STATUSES);
    if (subsErr) throw new Error(`قراءة الاشتراكات: ${subsErr.message}`);

    const userIds = [...new Set((subs ?? []).map((s) => s.user_id))];
    if (userIds.length === 0) {
      return jsonResponse({ ok: true, ...report, note: "لا اشتراكات قابلة للفوترة" });
    }

    const { data: profiles, error: profErr } = await mad3oom
      .from("profiles")
      .select("id, full_name, username, email, phone, address")
      .in("id", userIds);
    if (profErr) throw new Error(`قراءة العملاء: ${profErr.message}`);

    const customerRows = (profiles ?? []).map((p) => ({
      name: p.full_name || p.username || p.email || "عميل مدعوم",
      email: p.email ?? null,
      phone: p.phone ?? null,
      address: p.address ?? null,
      username: p.username ?? null,
      external_source: "mad3oom",
      external_id: p.id,
    }));

    // on_conflict على (external_source, external_id) — الفهرس الفريد يمنع التكرار
    const upsertRes = await accounting(
      "customers?on_conflict=external_source,external_id",
      {
        ...acct,
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(customerRows),
      },
    );
    const customers = await readJson(upsertRes, "مزامنة العملاء");
    report.customers_synced = customers.length;

    const customerByExternal = new Map(
      customers.map((c) => [String(c.external_id), String(c.id)]),
    );

    // ---------- 2) الفواتير من الاشتراكات ----------
    const plansRes = await accounting("service_plans?select=id,code,billing_cycle,price,currency", {
      ...acct,
      method: "GET",
    });
    const plans = await readJson(plansRes, "قراءة الباقات");
    const planKey = (code: unknown, cycle: unknown) => `${code}|${cycle}`;
    const planMap = new Map(plans.map((p) => [planKey(p.code, p.billing_cycle), p]));

    for (const sub of subs ?? []) {
      const customerId = customerByExternal.get(String(sub.user_id));
      const plan = planMap.get(planKey(sub.plan, sub.billing_cycle));

      if (!customerId || !plan) {
        report.invoices_skipped++;
        if (!plan) {
          const key = `${sub.plan}/${sub.billing_cycle}`;
          if (!report.unknown_plans.includes(key)) report.unknown_plans.push(key);
        }
        continue;
      }

      const total = Number(plan.price ?? 0);
      const issueDate = String(sub.start_date ?? "").slice(0, 10) || null;

      const res = await accounting("invoices?on_conflict=external_subscription_id", {
        ...acct,
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify([{
          customer_id: customerId,
          issue_date: issueDate,
          due_date: String(sub.end_date ?? "").slice(0, 10) || null,
          subtotal: total,
          tax_amount: 0,
          total,
          currency: plan.currency ?? "USD",
          status: "sent",
          source: "mad3oom",
          plan_id: plan.id,
          external_ticket_id: sub.ticket_id ?? null,
          external_subscription_id: sub.id,
        }]),
      });

      const created = await readJson(res, "إنشاء فاتورة");
      if (created.length > 0) report.invoices_created++;
      else report.invoices_skipped++;
    }

    // ---------- 3) تسليم الطابور إلى داخل التذاكر ----------
    const outboxRes = await accounting(
      "integration_outbox?status=eq.pending&event_type=eq.invoice.issued&order=created_at.asc&limit=100&select=id,payload",
      { ...acct, method: "GET" },
    );
    const events = await readJson(outboxRes, "قراءة الطابور");

    for (const event of events) {
      const payload = (event.payload ?? {}) as Json;
      try {
        const { data: recorded, error: recErr } = await mad3oom.rpc(
          "record_accounting_invoice",
          {
            p_payload: {
              external_invoice_id: payload.invoice_id,
              invoice_number: payload.invoice_number,
              ticket_id: payload.ticket_id,
              user_id: payload.customer_external_id,
              subscription_id: payload.subscription_id,
              plan: payload.plan,
              billing_cycle: payload.billing_cycle,
              subtotal: payload.subtotal,
              tax_amount: payload.tax_amount,
              total: payload.total,
              currency: payload.currency,
              issue_date: payload.issue_date,
              due_date: payload.due_date,
              status: payload.status,
            },
          },
        );
        if (recErr) throw new Error(recErr.message);

        // الرابط العام يعود للمحاسبة ليُطبع كرمز QR على الفاتورة
        await accounting(`invoices?id=eq.${payload.invoice_id}`, {
          ...acct,
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            public_url: recorded.public_url,
            public_token: recorded.public_token,
          }),
        });

        await accounting(`integration_outbox?id=eq.${event.id}`, {
          ...acct,
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "sent", sent_at: new Date().toISOString() }),
        });

        report.outbox_delivered++;
      } catch (err) {
        logFailure(requestId, `تسليم الحدث ${event.id}`, err);
        report.failed_event_ids.push(String(event.id));

        // الحدث يبقى معلّقاً ليُعاد في التشغيل التالي. السبب يُحفظ في
        // قاعدة المحاسبة للمشغّل، ولا يعود في رد HTTP.
        await accounting(`integration_outbox?id=eq.${event.id}`, {
          ...acct,
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ last_error: describe(err).slice(0, 500) }),
        });
      }
    }

    return jsonResponse({
      ok: report.failed_event_ids.length === 0,
      request_id: requestId,
      ...report,
    });
  } catch (err) {
    logFailure(requestId, "تشغيل المزامنة", err);
    return jsonResponse({
      ok: false,
      request_id: requestId,
      ...report,
      error: "تعذّر إكمال المزامنة. راجع سجل الدالة بمعرّف الطلب.",
    }, 500);
  }
});
