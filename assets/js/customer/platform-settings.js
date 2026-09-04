/**
 * platform-settings.js — المصدر الوحيد لإعدادات المنصة كما يراها العميل.
 *
 * كل قيمة هنا يضبطها الأدمن من لوحة الإدارة:
 *   - advanced_settings.customer_experience  (إعدادات تجربة العميل)
 *   - advanced_settings.sla_config           (أهداف زمن الرد)
 *   - advanced_settings.communication_control(حدود التذاكر)
 *   - advanced_settings.data_retention       (مدة الاحتفاظ)
 *   - advanced_settings.branding             (الهوية)
 *   - working_hours                          (ساعات عمل الدعم)
 *
 * الجدولين دول admin-only على مستوى RLS (وadvanced_settings فيه أسرار)، فالقراءة
 * بتتم عبر RPC واحدة SECURITY DEFINER بترجّع allow-list آمنة فقط:
 * get_customer_platform_settings() — راجع migrations/010.
 *
 * القيم الافتراضية هنا "متساهلة" عن قصد: لو الـRPC فشلت لأي سبب (شبكة/صلاحية)،
 * لوحة العميل تفضل شغالة بالسلوك الطبيعي بدل ما تتقفل في وشه.
 */

import { supabase } from '/api-config.js';

const DEFAULTS = Object.freeze({
    customer_experience: {
        welcome_message: '',
        enable_rewards_system: true,
        allow_ticket_attachments: true,
        allow_ticket_rating: true,
        show_support_online_status: true,
        support_whatsapp: ''
    },
    sla: { enabled: false, high_hours: null, medium_hours: null, low_hours: null },
    limits: { max_open_tickets: null, prevent_duplicate_tickets: false, ticket_retention_days: null },
    branding: { site_name: 'مدعوم', primary_color: '#0077CC' },
    support: { working_hours: [], is_online_now: false }
});

let cache = null;
let inflight = null;

/**
 * يجلب إعدادات المنصة مرة واحدة لكل تحميل صفحة (مع منع الطلبات المتوازية).
 * @param {{ force?: boolean }} options
 * @returns {Promise<typeof DEFAULTS>}
 */
export async function getPlatformSettings({ force = false } = {}) {
    if (cache && !force) return cache;
    if (inflight && !force) return inflight;

    inflight = (async () => {
        try {
            const { data, error } = await supabase.rpc('get_customer_platform_settings');
            if (error) throw error;
            cache = mergeWithDefaults(data);
        } catch (err) {
            console.warn('[PlatformSettings] تعذّر تحميل إعدادات المنصة، سيتم استخدام الافتراضيات:', err?.message || err);
            cache = structuredClone(DEFAULTS);
        } finally {
            inflight = null;
        }
        return cache;
    })();

    return inflight;
}

function mergeWithDefaults(data) {
    const merged = structuredClone(DEFAULTS);
    if (!data || typeof data !== 'object') return merged;
    for (const section of Object.keys(merged)) {
        if (data[section] && typeof data[section] === 'object') {
            Object.assign(merged[section], data[section]);
        }
    }
    return merged;
}

/* =========================================================
   مساعدات مشتقة من الإعدادات — منطق مشترك، مش مكرر في كل شاشة
========================================================= */

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** "09:00:00" -> "09:00" */
export function formatTime(value) {
    if (!value) return '';
    return String(value).slice(0, 5);
}

export function dayName(dayOfWeek) {
    return DAY_NAMES[dayOfWeek] ?? '';
}

/**
 * ملخص جاهز للعرض عن توفّر الدعم اليوم.
 * @returns {{ isOnline: boolean, todayLabel: string, today: object|null }}
 */
export function supportAvailability(settings) {
    const hours = settings?.support?.working_hours || [];
    const today = hours.find(h => h.day_of_week === new Date().getDay()) || null;

    let todayLabel = 'ساعات العمل غير محددة';
    if (today) {
        todayLabel = today.is_working_day
            ? `اليوم ${dayName(today.day_of_week)}: من ${formatTime(today.start_time)} إلى ${formatTime(today.end_time)}`
            : `اليوم ${dayName(today.day_of_week)}: إجازة`;
    }

    return { isOnline: !!settings?.support?.is_online_now, todayLabel, today };
}

/**
 * هدف زمن الرد لأولوية معيّنة، بالساعات، أو null لو الأدمن مفعّلش SLA.
 */
export function slaTargetHours(settings, priority) {
    const sla = settings?.sla;
    if (!sla?.enabled) return null;
    const map = { high: sla.high_hours, medium: sla.medium_hours, low: sla.low_hours };
    const value = Number(map[priority] ?? sla.medium_hours);
    return Number.isFinite(value) && value > 0 ? value : null;
}
