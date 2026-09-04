// customer-dashboard.js — منطق لوحة العميل
//
// البنية: كل قسم في اللوحة له وحدة render خاصة به، وكلها بتقرأ من:
//   - tickets-service.js        (التذاكر، الردود، المرفقات، التقييم)
//   - notifications-service.js  (الإشعارات)
//   - rewards-dashboard.js      (المكافآت)
//   - assets/js/customer/customer-data.js       (حالة الحساب والخدمات)
//   - assets/js/customer/platform-settings.js   (إعدادات الأدمن)
// مفيش استعلامات مكررة هنا لأي حاجة ليها خدمة أصلاً.
import { requireAuth, updateProfile, updatePassword } from './auth-client.js';
import { initCustomerSidebar, setSidebarBadge, setActiveSidebarTab } from './assets/js/customer-sidebar.js';
import { initExpiryModalHandler } from './assets/js/subscription-expiry-modal.js';
import { initRewardsDashboard } from './rewards-dashboard.js';
import { initCustomerSettingsModal } from './customer-settings-modal.js';
import {
    fetchUserTickets,
    createTicket,
    fetchTicketStats,
    fetchTicketReplies,
    addTicketReply,
    subscribeToTickets,
    deleteTicket,
    fetchTicketAttachments,
    fetchTicketTags,
    fetchTicketActivity,
    fetchTicketRating,
    submitTicketRating,
    uploadTicketAttachment
} from './tickets-service.js';
import {
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    subscribeToNotifications,
    formatRelativeArabic
} from './notifications-service.js';
import { ui } from './ui-service.js';
import { getPlatformSettings, supportAvailability, slaTargetHours, formatTime, dayName } from './assets/js/customer/platform-settings.js';
import * as customerData from './assets/js/customer/customer-data.js';

/* =========================================================
   حماية من bfcache (Back-Forward Cache)
   =========================================================
   لو المستخدم سجّل خروج ثم ضغط "رجوع"، بعض المتصفحات بترجّع نسخة مجمدة من
   الصفحة من الذاكرة من غير ما تعيد تنفيذ الكود، فتبان وكأنه لسه مسجّل دخول.
   إعادة التحميل القسرية بتخلي requireAuth() يشتغل تاني ويكتشف غياب الجلسة.
========================================================= */
window.addEventListener('pageshow', (event) => {
    if (event.persisted) window.location.reload();
});

/* =========================================================
   أدوات مشتركة
========================================================= */

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('./')) {
        return escapeHtml(trimmed);
    }
    return '';
}

const STATUS_LABELS = { open: 'مفتوحة', 'in-progress': 'قيد المعالجة', resolved: 'تم الحل', confirmed: 'مؤكدة', rejected: 'مرفوضة' };
const PRIORITY_LABELS = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
const CATEGORY_LABELS = { whatsapp: 'واتساب', tickets: 'تذاكر', subscription: 'اشتراك', login: 'تسجيل دخول', other: 'أخرى' };
const CATEGORY_CLASS = { whatsapp: 'cat-whatsapp', tickets: 'cat-tickets', subscription: 'cat-subscription', login: 'cat-login', other: 'cat-other' };

const ACTIVITY_LABELS = {
    create: 'تم إنشاء التذكرة',
    status_change: 'تغيّرت حالة التذكرة',
    priority_change: 'تم تحديث الأولوية',
    category_change: 'تم تحديث التصنيف',
    reply: 'تم إضافة رد',
    reopen: 'تم إعادة فتح التذكرة',
    rating: 'تم تسجيل تقييمك',
    tag_add: 'تمت إضافة وسم',
    tag_remove: 'تمت إزالة وسم'
};

// نوع الحدث اللي محجوب على مستوى قاعدة البيانات (migrations/010). الفلترة هنا
// طبقة إضافية للعرض فقط، مش هي الحماية.
const CUSTOMER_HIDDEN_ACTIVITY_TYPES = new Set(['assignee_change', 'assigned', 'internal_note']);

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function statusBadge(status) {
    const label = STATUS_LABELS[status] || status || '—';
    return `<span class="pill status-${escapeHtml(status || 'neutral')}"><span class="pill-dot"></span>${escapeHtml(label)}</span>`;
}

function priorityBadge(priority, { onlyHigh = false } = {}) {
    if (!priority || (onlyHigh && priority !== 'high')) return '';
    return `<span class="pill priority-${escapeHtml(priority)}">${escapeHtml(PRIORITY_LABELS[priority] || priority)}</span>`;
}

function categoryBadge(category) {
    if (!category) return '';
    const cls = CATEGORY_CLASS[category] || 'cat-other';
    return `<span class="pill ${cls}">${escapeHtml(CATEGORY_LABELS[category] || category)}</span>`;
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `منذ ${days} يوم`;
    return new Date(dateStr).toLocaleDateString('ar-EG');
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('ar-EG');
}

function daysUntil(dateStr) {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

/** رسم حالة موحّدة (تحميل/فراغ/خطأ) داخل أي حاوية. */
function renderState(container, { variant = 'empty', title, text, icon = true } = {}) {
    if (!container) return;
    const iconSvg = icon
        ? (variant === 'error'
            ? '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
            : '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>')
        : '';
    container.innerHTML = `
        <div class="state-block ${variant === 'error' ? 'state-block--error' : ''}">
            ${iconSvg}
            <p class="state-title">${escapeHtml(title || '')}</p>
            ${text ? `<p class="state-text">${escapeHtml(text)}</p>` : ''}
        </div>`;
}

function renderSkeletonLines(container, count = 3) {
    if (!container) return;
    container.innerHTML = Array.from({ length: count }, () => '<div class="skeleton skeleton-line"></div>').join('');
}

/** ملء عنصر بقيمة رقمية بأمان. */
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

/* =========================================================
   نقطة البداية
========================================================= */

(async function () {

    /* ================= المصادقة ================= */

    const user = await requireAuth('user');
    if (!user) {
        window.location.replace('login.html');
        return;
    }

    const isGuest = user.isGuest || false;
    const isImpersonated = !!user.isImpersonated;

    // إعدادات المنصة تُحمَّل أولاً لأن أقسام كثيرة بتتغيّر شكلها بناءً عليها
    // (المرفقات، التقييم، حدود التذاكر، رسالة الترحيب).
    const settings = await getPlatformSettings();
    const cx = settings.customer_experience;

    /* ================= شريط انتحال الحساب ================= */

    if (isImpersonated) {
        const banner = document.createElement('div');
        banner.id = 'dashboardImpersonationBanner';
        banner.className = 'impersonation-banner';
        const memberName = user.profile?.full_name || user.profile?.email || 'هذا العضو';
        const isSelfLogin = user.impersonatorId && user.impersonatorId === user.id;

        const label = document.createElement('span');
        if (isSelfLogin) {
            label.textContent = 'بتشوف حسابك كـ عضو (وضع "الدخول كعضو")';
        } else {
            // .textContent عمدًا: الاسم قيمة قادمة من قاعدة البيانات
            label.textContent = `بتشوف لوحة العضو: ${memberName}`;
        }

        const backBtn = document.createElement('button');
        backBtn.type = 'button';
        backBtn.textContent = 'رجوع لحسابي';
        backBtn.addEventListener('click', () => {
            const url = new URL(window.location.href);
            url.searchParams.delete('impersonate');
            window.location.href = url.pathname + url.search;
        });

        banner.append(label, backBtn);
        document.body.insertBefore(banner, document.body.firstChild);
    }

    /* ================= التنقّل بين الأقسام ================= */

    const SECTIONS = ['overview', 'tickets', 'notifications', 'rewards', 'badges', 'profile'];
    const GUEST_BLOCKED = new Set(['rewards', 'badges', 'profile', 'notifications']);
    let currentSection = 'overview';

    // أقسام يخفيها إعداد من لوحة الإدارة. المكافآت مرتبطة بـ
    // customer_experience.enable_rewards_system — لو الأدمن أطفأها، القسم
    // يختفي من اللوحة ومن القائمة الجانبية معاً، مش من واحدة بس.
    const disabledSections = new Set();
    if (!cx.enable_rewards_system) {
        disabledSections.add('rewards');
        const index = SECTIONS.indexOf('rewards');
        if (index > -1) SECTIONS.splice(index, 1);
        GUEST_BLOCKED.delete('rewards');
        document.getElementById('rewardsTabContent')?.remove();
    }

    // ما يُحمَّل مرة واحدة فقط عند أول زيارة للقسم (Lazy load)
    const loadedOnce = new Set();

    function showSection(name, { updateHash = true } = {}) {
        if (!SECTIONS.includes(name)) name = 'overview';

        if (isGuest && GUEST_BLOCKED.has(name)) {
            ui.showToast('هذه الميزة غير متاحة في وضع الضيف. سجّل الدخول للاستفادة منها.', 'info');
            return;
        }

        currentSection = name;
        SECTIONS.forEach(section => {
            const el = document.getElementById(`${section}TabContent`);
            if (el) el.classList.toggle('active', section === name);
        });

        setActiveSidebarTab(name);
        if (updateHash && window.location.hash.slice(1) !== name) {
            history.replaceState(null, '', `#${name}`);
        }
        document.getElementById('customerMain')?.scrollIntoView({ block: 'start', behavior: 'auto' });

        if (!loadedOnce.has(name)) {
            loadedOnce.add(name);
            lazyLoadSection(name);
        }
    }

    function lazyLoadSection(name) {
        if (name === 'badges') renderBadges();
        if (name === 'notifications') renderNotifications();
        if (name === 'profile') renderProfileSection();
    }

    window.addEventListener('hashchange', () => {
        showSection(window.location.hash.slice(1) || 'overview', { updateHash: false });
    });

    /* ================= القائمة الجانبية ================= */

    initCustomerSidebar({
        onTabChange: (tabName) => showSection(tabName),
        onReady: () => {
            updateSidebarUserInfo();
            refreshNotificationBadge();
            disabledSections.forEach(section => {
                document.querySelector(`.sidebar-item[data-tab="${section}"]`)?.remove();
            });
            setActiveSidebarTab(currentSection);
        }
    });

    function updateSidebarUserInfo() {
        const initialEl = document.getElementById('customerInitial');
        if (initialEl) {
            const source = user.profile?.full_name || user.email || 'U';
            initialEl.textContent = source.trim().charAt(0).toUpperCase();
        }
    }

    if (!isGuest) {
        initExpiryModalHandler();
        initCustomerSettingsModal();
    }

    /* =========================================================
       قسم: نظرة عامة
    ========================================================= */

    // نتيجة آخر تحميل — تُستخدم لبناء التنبيهات بدون إعادة استعلام
    let overviewSnapshot = null;

    async function renderOverview() {
        const welcomeEl = document.getElementById('overviewWelcomeMessage');
        const headingEl = document.getElementById('overviewHeading');

        const displayName = user.profile?.full_name || user.email?.split('@')[0] || 'مستخدم';
        if (headingEl) headingEl.textContent = isGuest ? 'مرحباً بك (زائر)' : `مرحباً، ${displayName}`;

        // رسالة الترحيب يضبطها الأدمن من "إعدادات تجربة العميل"
        if (welcomeEl) {
            welcomeEl.textContent = cx.welcome_message?.trim()
                || 'تابع تذاكرك وحالة خدماتك من مكان واحد.';
        }

        if (isGuest) {
            renderGuestOverview();
            return;
        }

        const [
            statsRes, account, planSubs, waSub, wallet, sie, subdomains,
            systemStatus, activity, badges, tickets
        ] = await Promise.all([
            fetchTicketStats().catch(err => { console.error('[Overview] stats:', err); return null; }),
            customerData.fetchAccountStatus(),
            customerData.fetchPlanSubscriptions(),
            customerData.fetchWhatsappSubscription(),
            customerData.fetchWhatsappWallet(),
            customerData.fetchSieAccess(),
            customerData.fetchSubdomains(),
            customerData.fetchSystemStatus(),
            customerData.fetchAccountActivity(8),
            customerData.fetchBadgeProgress(),
            fetchUserTickets({}).catch(() => [])
        ]);

        overviewSnapshot = { statsRes, account, planSubs, waSub, wallet, sie, subdomains, systemStatus, badges, tickets };

        renderOverviewKpis(statsRes, tickets, badges);
        renderAccountStatus({ account, planSubs, waSub, wallet, sie, subdomains });
        renderSupportAvailability();
        renderSystemStatus(systemStatus);
        renderRecentActivity(activity);
        renderOverviewAlerts();
    }

    function renderGuestOverview() {
        document.getElementById('overviewKpis').innerHTML = '';
        const guestNotice = {
            title: 'أنت في وضع الضيف',
            text: 'سجّل الدخول بحساب لعرض تذاكرك وحالة خدماتك ومتابعة اشتراكاتك.'
        };
        ['accountStatusBody', 'supportAvailabilityBody', 'recentActivityBody'].forEach(id => {
            renderState(document.getElementById(id), { variant: 'empty', ...guestNotice });
        });
        renderSupportAvailability();
        customerData.fetchSystemStatus().then(renderSystemStatus);
    }

    /** يحسب التذاكر التي ينتظر فيها الفريقُ ردَّ العميل. */
    function countAwaitingCustomer(tickets) {
        return (tickets || []).filter(t =>
            t.status !== 'resolved' &&
            t.last_updated_by &&
            t.last_updated_by !== user.id
        ).length;
    }

    /** متوسط زمن أول رد على تذاكر العميل (بالساعات) — مؤشر حقيقي من بياناته هو. */
    function averageFirstResponseHours(tickets) {
        const answered = (tickets || []).filter(t => t.first_response_at && t.created_at);
        if (!answered.length) return null;
        const totalMs = answered.reduce((sum, t) =>
            sum + (new Date(t.first_response_at) - new Date(t.created_at)), 0);
        return totalMs / answered.length / 3600000;
    }

    function renderOverviewKpis(stats, tickets, badges) {
        const container = document.getElementById('overviewKpis');
        if (!container) return;

        const awaiting = countAwaitingCustomer(tickets);
        const avgHours = averageFirstResponseHours(tickets);
        const badgeData = badges?.ok ? badges.data : null;

        const cards = [
            {
                label: 'تذاكر مفتوحة',
                value: stats ? (stats.open + stats.inProgress) : '—',
                hint: stats ? `${stats.total} تذكرة إجمالاً` : '',
                tone: 'info',
                action: 'tickets'
            },
            {
                label: 'بانتظار ردّك',
                value: awaiting,
                hint: awaiting ? 'فيه ردود من الدعم محتاجة متابعتك' : 'لا شيء ينتظر ردك',
                tone: awaiting ? 'warning' : 'success',
                action: 'tickets'
            },
            {
                label: 'متوسط أول رد',
                value: avgHours === null ? '—' : `${avgHours < 1 ? Math.round(avgHours * 60) : avgHours.toFixed(1)}`,
                hint: avgHours === null ? 'لم يُسجَّل رد بعد' : (avgHours < 1 ? 'دقيقة على تذاكرك' : 'ساعة على تذاكرك'),
                tone: 'accent'
            },
            {
                label: 'الشارات',
                value: badgeData ? `${badgeData.earned}/${badgeData.total}` : '—',
                hint: 'إنجازاتك على المنصة',
                tone: 'accent',
                action: 'badges'
            }
        ];

        container.innerHTML = cards.map(card => {
            const tag = card.action ? 'button' : 'div';
            const attrs = card.action ? ` type="button" data-goto="${card.action}"` : '';
            return `
                <${tag} class="kpi kpi--${card.tone}${card.action ? ' is-clickable' : ''}"${attrs}>
                    <span class="kpi-label">${escapeHtml(card.label)}</span>
                    <span class="kpi-value">${escapeHtml(String(card.value))}</span>
                    ${card.hint ? `<span class="kpi-hint">${escapeHtml(card.hint)}</span>` : ''}
                </${tag}>`;
        }).join('');
    }

    function renderAccountStatus({ account, planSubs, waSub, wallet, sie, subdomains }) {
        const container = document.getElementById('accountStatusBody');
        if (!container) return;

        if (!account?.ok) {
            renderState(container, { variant: 'error', title: 'تعذّر تحميل حالة الحساب', text: 'حدّث الصفحة أو حاول بعد قليل.' });
            return;
        }

        const profile = account.data || {};
        const rows = [];

        // 1) حالة الحساب نفسه (يتحكم فيها الأدمن)
        const banned = profile.ban_status && profile.ban_status !== 'active' && profile.ban_status !== 'none';
        rows.push({
            label: 'حالة الحساب',
            value: banned
                ? `<span class="pill status-rejected"><span class="pill-dot"></span>مقيّد</span>`
                : `<span class="pill status-resolved"><span class="pill-dot"></span>نشط</span>`,
            note: escapeHtml(banned
                ? (profile.ban_reason ? `السبب: ${profile.ban_reason}` : 'تواصل مع الدعم لمعرفة التفاصيل.')
                : `عضو منذ ${formatDate(profile.created_at)}`)
        });

        // 2) باقات المنصة (customer_subscriptions — يديرها الأدمن)
        if (planSubs?.ok) {
            const active = (planSubs.data || []).filter(s =>
                s.status === 'active' && (!s.end_date || new Date(s.end_date) > new Date()));
            if (active.length) {
                rows.push({
                    label: 'الباقات المفعّلة',
                    value: active.map(s =>
                        `<span class="pill status-resolved">${escapeHtml(s.subscription_plans?.name_ar || s.subscription_plans?.name || 'باقة')}</span>`
                    ).join(' '),
                    note: escapeHtml(active
                        .filter(s => s.end_date)
                        .map(s => `${s.subscription_plans?.name_ar || 'الباقة'} حتى ${formatDate(s.end_date)}`)
                        .join(' · '))
                });
            }
        }

        // 3) خدمة الواتساب (اشتراك أو تفعيل يدوي من الأدمن)
        const waStatus = waSub?.ok ? waSub.data : null;
        if (waStatus?.hasActiveSubscription) {
            rows.push({
                label: 'خدمة الواتساب',
                value: `<span class="pill status-resolved"><span class="pill-dot"></span>فعّالة</span>`,
                note: escapeHtml(`متبقٍ ${waStatus.daysRemaining} يوم — حتى ${formatDate(waStatus.activeSubscription?.end_date)}`)
            });
        } else if (profile.whatsapp_enabled) {
            rows.push({
                label: 'خدمة الواتساب',
                value: `<span class="pill status-resolved"><span class="pill-dot"></span>مفعّلة</span>`,
                note: 'مفعّلة لحسابك من فريق الإدارة'
            });
        }

        // 4) رصيد الواتساب (يشحنه الأدمن)
        if (wallet?.ok && wallet.data) {
            const w = wallet.data;
            rows.push({
                label: 'رصيد الواتساب',
                value: escapeHtml(`${w.balance.toLocaleString('ar-EG')} ${w.currency || ''}`),
                note: escapeHtml(w.isLow
                    ? `الرصيد أقل من الحد الأدنى (${w.low_balance_threshold}) — تواصل مع الدعم للشحن.`
                    : `آخر تحديث ${formatDate(w.updated_at)}`)
            });
        }

        // 5) وصول المحرك الذكي (الأدمن يمنحه ويحدد الحصة)
        if (sie?.ok && sie.data?.is_enabled) {
            const s = sie.data;
            const meterClass = s.usedPercent >= 90 ? 'meter-fill--danger' : s.usedPercent >= 70 ? 'meter-fill--warning' : '';
            rows.push({
                label: 'المحرك الذكي',
                value: s.quota > 0 ? escapeHtml(`${s.used} / ${s.quota} رسالة`) : 'بدون حد',
                note: s.quota > 0
                    ? `<div class="meter" style="margin-top:.4rem;"><div class="meter-fill ${meterClass}" style="width:${s.usedPercent}%"></div></div>`
                    : (s.expires_at ? escapeHtml(`ينتهي في ${formatDate(s.expires_at)}`) : ''),
                noteIsHtml: s.quota > 0
            });
        }

        // 6) النطاقات الفرعية (العميل يطلبها والأدمن يفعّلها)
        if (subdomains?.ok && subdomains.data?.length) {
            const activeDomain = subdomains.data.find(d => d.status === 'active') || subdomains.data[0];
            const statusClass = activeDomain.status === 'active' ? 'status-resolved'
                : activeDomain.status === 'pending' ? 'status-in-progress' : 'status-neutral';
            rows.push({
                label: 'النطاق الفرعي',
                value: `<span class="pill ${statusClass}">${escapeHtml(activeDomain.full_domain || activeDomain.subdomain)}</span>`,
                note: escapeHtml(activeDomain.status === 'active'
                    ? `مفعّل منذ ${formatDate(activeDomain.activated_at || activeDomain.created_at)}`
                    : `الحالة: ${activeDomain.status}`)
            });
        }

        // كل من row.value و row.note مبنيان أعلاه كـHTML آمن بالفعل (أي نص
        // قادم من قاعدة البيانات مرّ على escapeHtml عند بنائه)، فلا نهرّبهما
        // مرة تانية هنا حتى لا تتحوّل الشارات والمؤشرات إلى نص خام.
        container.innerHTML = `<div class="data-rows">${rows.map(row => `
            <div class="data-row">
                <span class="data-row-label">${escapeHtml(row.label)}</span>
                <span class="data-row-value">${row.value}</span>
                ${row.note ? `<div class="data-row-note">${row.note}</div>` : ''}
            </div>`).join('')}</div>`;
    }

    function renderSupportAvailability() {
        const container = document.getElementById('supportAvailabilityBody');
        if (!container) return;

        const { isOnline, todayLabel } = supportAvailability(settings);
        const hours = settings.support?.working_hours || [];
        const parts = [];

        // إظهار حالة الاتصال يتحكم فيها الأدمن (show_support_online_status)
        if (cx.show_support_online_status) {
            parts.push(`
                <div class="data-row">
                    <span class="data-row-label">حالة الفريق الآن</span>
                    <span class="data-row-value">
                        <span class="pill ${isOnline ? 'status-resolved' : 'status-neutral'}">
                            <span class="pill-dot"></span>${isOnline ? 'متاح الآن' : 'خارج ساعات العمل'}
                        </span>
                    </span>
                    <p class="data-row-note">${escapeHtml(todayLabel)}</p>
                </div>`);
        }

        // أهداف زمن الرد كما ضبطها الأدمن في sla_config
        const slaRows = ['high', 'medium', 'low']
            .map(p => ({ p, hours: slaTargetHours(settings, p) }))
            .filter(x => x.hours !== null);

        if (slaRows.length) {
            parts.push(`
                <div class="data-row">
                    <span class="data-row-label">هدف أول رد</span>
                    <span class="data-row-value">${slaRows.map(x =>
                        `<span class="pill priority-${x.p}">${escapeHtml(PRIORITY_LABELS[x.p])}: ${x.hours} س</span>`
                    ).join(' ')}</span>
                </div>`);
        }

        if (hours.length) {
            const workingDays = hours.filter(h => h.is_working_day);
            const summary = workingDays.length
                ? workingDays.map(h => `${dayName(h.day_of_week)} ${formatTime(h.start_time)}–${formatTime(h.end_time)}`).join(' · ')
                : 'لا توجد أيام عمل محددة';
            parts.push(`
                <div class="data-row">
                    <span class="data-row-label">ساعات العمل</span>
                    <span class="data-row-value">${workingDays.length} أيام أسبوعياً</span>
                    <p class="data-row-note">${escapeHtml(summary)}</p>
                </div>`);
        }

        // رقم واتساب الدعم — يضبطه الأدمن، ولو فاضي مش بيتعرض أصلاً
        if (cx.support_whatsapp) {
            parts.push(`
                <div class="data-row">
                    <span class="data-row-label">واتساب الدعم</span>
                    <span class="data-row-value">
                        <a class="panel-link" href="https://wa.me/${encodeURIComponent(cx.support_whatsapp)}" target="_blank" rel="noopener noreferrer">تواصل مباشر</a>
                    </span>
                </div>`);
        }

        if (!parts.length) {
            renderState(container, { variant: 'empty', title: 'لم تُحدَّد ساعات عمل بعد', text: 'يمكنك فتح تذكرة في أي وقت وسيصلك الرد فور توفّر الفريق.' });
            return;
        }

        container.innerHTML = `<div class="data-rows">${parts.join('')}</div>`;
    }

    const SERVICE_STATUS_LABELS = {
        operational: 'يعمل بشكل طبيعي',
        degraded: 'أداء منخفض',
        partial_outage: 'انقطاع جزئي',
        major_outage: 'انقطاع كامل',
        maintenance: 'صيانة'
    };

    function renderSystemStatus(result) {
        const container = document.getElementById('systemStatusBody');
        if (!container) return;

        if (!result?.ok) {
            renderState(container, { variant: 'error', title: 'تعذّر تحميل حالة النظام' });
            return;
        }

        const { services, incidents, degraded, allOperational } = result.data;

        if (!services.length) {
            renderState(container, { variant: 'empty', title: 'لا توجد خدمات مُراقَبة حالياً' });
            return;
        }

        const banner = allOperational
            ? `<div class="alert-item alert-item--success">
                   <span class="alert-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></span>
                   <div class="alert-body"><p class="alert-title">كل الخدمات تعمل بشكل طبيعي</p></div>
               </div>`
            : `<div class="alert-item alert-item--warning">
                   <span class="alert-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
                   <div class="alert-body">
                       <p class="alert-title">${degraded.length} خدمة بها مشكلة حالياً</p>
                       <p class="alert-text">${escapeHtml(degraded.map(s => s.name).join('، '))}</p>
                   </div>
               </div>`;

        const incidentsHtml = incidents.length ? `
            <div class="alert-list" style="margin-top: var(--sp-3);">
                ${incidents.map(inc => `
                    <div class="alert-item alert-item--danger">
                        <span class="alert-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/></svg></span>
                        <div class="alert-body">
                            <p class="alert-title">${escapeHtml(inc.title)}</p>
                            <p class="alert-text">${escapeHtml(inc.description || '')} — بدأ ${timeAgo(inc.created_at)}</p>
                        </div>
                    </div>`).join('')}
            </div>` : '';

        const rows = services.map(s => {
            const isOk = s.status === 'operational';
            return `
                <div class="data-row">
                    <span class="data-row-label">${escapeHtml(s.name)}</span>
                    <span class="data-row-value">
                        <span class="pill ${isOk ? 'status-resolved' : 'status-in-progress'}">
                            <span class="pill-dot"></span>${escapeHtml(SERVICE_STATUS_LABELS[s.status] || s.status)}
                        </span>
                    </span>
                </div>`;
        }).join('');

        container.innerHTML = `${banner}${incidentsHtml}<div class="data-rows" style="margin-top: var(--sp-3);">${rows}</div>`;
    }

    const ACTION_LABELS = {
        login: 'تسجيل دخول',
        logout: 'تسجيل خروج',
        ticket_create: 'إنشاء تذكرة',
        ticket_reply: 'إضافة رد على تذكرة',
        ticket_delete: 'أرشفة تذكرة',
        profile_update: 'تحديث الملف الشخصي',
        password_change: 'تغيير كلمة المرور',
        subscription_request: 'طلب اشتراك'
    };

    function renderRecentActivity(result) {
        const container = document.getElementById('recentActivityBody');
        if (!container) return;

        if (!result?.ok) {
            renderState(container, { variant: 'error', title: 'تعذّر تحميل سجل النشاط' });
            return;
        }

        const logs = result.data || [];
        if (!logs.length) {
            renderState(container, { variant: 'empty', title: 'لا يوجد نشاط مسجَّل بعد', text: 'ستظهر هنا عملياتك على المنصة أولاً بأول.' });
            return;
        }

        container.innerHTML = `
            <div class="activity-timeline">
                ${logs.map(log => `
                    <div class="activity-item">
                        <span class="activity-icon">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </span>
                        <div>
                            <div class="activity-text">${escapeHtml(ACTION_LABELS[log.action] || log.action)}</div>
                            <div class="activity-time">${escapeHtml(timeAgo(log.created_at))}${log.device_info ? ` · ${escapeHtml(log.device_info)}` : ''}</div>
                        </div>
                    </div>`).join('')}
            </div>`;
    }

    /**
     * تنبيهات "يحتاج انتباهك" — كلها مشتقة من بيانات حقيقية، مفيش أي تنبيه ثابت.
     */
    function renderOverviewAlerts() {
        const panel = document.getElementById('overviewAlertsPanel');
        const list = document.getElementById('overviewAlertsList');
        if (!panel || !list || !overviewSnapshot) return;

        const { account, waSub, wallet, sie, tickets, systemStatus } = overviewSnapshot;
        const alerts = [];

        const profile = account?.ok ? account.data : null;
        if (profile?.ban_status && !['active', 'none'].includes(profile.ban_status)) {
            alerts.push({
                tone: 'danger',
                title: 'حسابك مقيّد حالياً',
                text: profile.ban_reason || 'تواصل مع فريق الدعم لمعرفة التفاصيل وإعادة التفعيل.'
            });
        }

        const awaiting = countAwaitingCustomer(tickets);
        if (awaiting > 0) {
            alerts.push({
                tone: 'warning',
                title: `${awaiting} تذكرة بانتظار ردّك`,
                text: 'فريق الدعم ردّ عليك ولم تردّ بعد — الرد السريع يقصّر زمن الحل.',
                action: { label: 'عرض التذاكر', goto: 'tickets' }
            });
        }

        const wa = waSub?.ok ? waSub.data : null;
        if (wa?.isExpiringSoon) {
            alerts.push({
                tone: 'warning',
                title: `اشتراك الواتساب ينتهي خلال ${wa.daysRemaining} يوم`,
                text: `تاريخ الانتهاء: ${formatDate(wa.expiringSubscription?.end_date)} — جدّد قبل الانتهاء لتفادي توقّف الخدمة.`,
                action: { label: 'الاشتراكات', href: '/customer-subscriptions.html' }
            });
        }

        if (wallet?.ok && wallet.data?.isLow) {
            alerts.push({
                tone: 'warning',
                title: 'رصيد الواتساب منخفض',
                text: `الرصيد الحالي ${wallet.data.balance} ${wallet.data.currency || ''} وهو تحت الحد الأدنى المحدد لحسابك.`
            });
        }

        const sieData = sie?.ok ? sie.data : null;
        if (sieData?.is_enabled && sieData.usedPercent !== null && sieData.usedPercent >= 80) {
            alerts.push({
                tone: sieData.usedPercent >= 100 ? 'danger' : 'warning',
                title: sieData.usedPercent >= 100 ? 'استُهلكت حصة المحرك الذكي بالكامل' : 'اقتربت من نهاية حصة المحرك الذكي',
                text: `استخدمت ${sieData.used} من ${sieData.quota} رسالة.`
            });
        }
        if (sieData?.is_enabled && sieData.isExpired) {
            alerts.push({
                tone: 'danger',
                title: 'انتهت صلاحية وصولك للمحرك الذكي',
                text: `انتهت في ${formatDate(sieData.expires_at)} — تواصل مع الدعم للتجديد.`
            });
        }

        const sys = systemStatus?.ok ? systemStatus.data : null;
        if (sys?.incidents?.length) {
            alerts.push({
                tone: 'info',
                title: 'يوجد عُطل معلن حالياً',
                text: `${sys.incidents[0].title} — قد يفسّر ما تواجهه قبل فتح تذكرة جديدة.`
            });
        }

        if (!alerts.length) {
            panel.hidden = true;
            return;
        }

        panel.hidden = false;
        list.innerHTML = alerts.map(a => `
            <div class="alert-item alert-item--${a.tone}">
                <span class="alert-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/><circle cx="12" cy="12" r="10"/></svg>
                </span>
                <div class="alert-body">
                    <p class="alert-title">${escapeHtml(a.title)}</p>
                    <p class="alert-text">${escapeHtml(a.text)}</p>
                </div>
                ${a.action
                    ? (a.action.href
                        ? `<a class="alert-action" href="${escapeHtml(a.action.href)}">${escapeHtml(a.action.label)}</a>`
                        : `<button type="button" class="alert-action" data-goto="${escapeHtml(a.action.goto)}" style="background:none;border:none;cursor:pointer;font-family:inherit;">${escapeHtml(a.action.label)}</button>`)
                    : ''}
            </div>`).join('');
    }

    /* =========================================================
       قسم: التذاكر
    ========================================================= */

    let currentTicketId = null;
    let currentFilters = { status: 'all', search: '' };
    let cachedTickets = [];
    let openTicketCount = 0;

    async function renderStats() {
        if (isGuest) return null;

        const stats = await fetchTicketStats().catch(err => {
            console.error('[Tickets] stats:', err);
            return null;
        });
        if (!stats) return null;

        setText('userTotalTickets', stats.total ?? 0);
        setText('userOpenTickets', stats.open ?? 0);
        setText('userInProgressTickets', stats.inProgress ?? 0);
        setText('userResolvedTickets', stats.resolved ?? 0);

        openTicketCount = (stats.open ?? 0) + (stats.inProgress ?? 0);
        setSidebarBadge('tickets', openTicketCount);
        updateTicketLimitHint();
        return stats;
    }

    /** يبيّن للعميل حد التذاكر المفتوحة اللي ضبطه الأدمن قبل ما يصطدم بيه. */
    function updateTicketLimitHint() {
        const hintEl = document.getElementById('ticketsLimitHint');
        if (!hintEl) return;

        const max = settings.limits?.max_open_tickets;
        const parts = [];
        if (max) {
            parts.push(`لديك ${openTicketCount} من ${max} تذاكر مفتوحة مسموح بها في نفس الوقت.`);
        }
        if (settings.limits?.ticket_retention_days) {
            parts.push(`تُؤرشف التذاكر تلقائياً بعد ${settings.limits.ticket_retention_days} يوماً.`);
        }
        hintEl.textContent = parts.join(' ');
    }

    function ticketNeedsCustomerReply(ticket) {
        return ticket.status !== 'resolved'
            && ticket.last_updated_by
            && ticket.last_updated_by !== user.id;
    }

    /**
     * تلميح "الرد المتوقع" من sla_response_due_at المخزّن على التذكرة.
     * الوحدة بتتدرّج (دقائق → ساعات → أيام) عشان الرقم يفضل مقروء مهما كانت
     * المهلة، بدل ما يطلع رقم ساعات ضخم لو المهلة بعيدة.
     */
    function slaFriendlyHint(ticket) {
        if (!ticket?.sla_response_due_at || ticket.first_response_at || ticket.status === 'resolved') return '';

        const diffHours = (new Date(ticket.sla_response_due_at) - Date.now()) / 3600000;
        if (Number.isNaN(diffHours)) return '';

        if (diffHours <= 0) {
            return `<div class="ticket-sla-hint"><span class="pill sla-warn">تأخر الرد — الفريق يتابعها</span></div>`;
        }

        let label;
        if (diffHours < 1) {
            label = `خلال ${Math.max(1, Math.round(diffHours * 60))} دقيقة`;
        } else if (diffHours < 48) {
            label = `خلال ${Math.round(diffHours)} ساعة`;
        } else {
            label = `خلال ${Math.round(diffHours / 24)} يوم`;
        }
        return `<div class="ticket-sla-hint"><span class="pill sla-info">الرد المتوقع ${escapeHtml(label)}</span></div>`;
    }

    async function renderTickets(filters = currentFilters) {
        const list = document.getElementById('userTicketsList');
        const countEl = document.getElementById('ticketsResultCount');
        if (!list) return;

        // وضع الضيف: مفيش جلسة أصلاً، فخدمات التذاكر هترمي استثناء. نعرض
        // رسالة صحيحة بدل رسالة "تعذّر الاتصال" المضللة.
        if (isGuest) {
            renderState(list, {
                variant: 'empty',
                title: 'سجّل الدخول لعرض تذاكرك',
                text: 'تذاكر الدعم مرتبطة بحسابك. أنشئ حساباً أو سجّل الدخول للمتابعة.'
            });
            if (countEl) countEl.textContent = '';
            clearTicketPanel();
            return;
        }

        list.innerHTML = '<div style="padding: var(--sp-3);">' +
            '<div class="skeleton skeleton-card" style="margin-bottom:.5rem;"></div>'.repeat(3) + '</div>';

        let tickets;
        try {
            tickets = await fetchUserTickets(filters);
        } catch (err) {
            console.error('[Tickets] fetch:', err);
            renderState(list, { variant: 'error', title: 'تعذّر تحميل التذاكر', text: 'تحقق من اتصالك ثم حدّث الصفحة.' });
            if (countEl) countEl.textContent = '';
            return;
        }

        cachedTickets = tickets || [];

        if (countEl) {
            countEl.textContent = cachedTickets.length
                ? `${cachedTickets.length} تذكرة`
                : '';
        }

        if (!cachedTickets.length) {
            const filtered = filters.status !== 'all' || filters.search;
            renderState(list, {
                variant: 'empty',
                title: filtered ? 'لا توجد نتائج مطابقة' : 'لا توجد تذاكر حتى الآن',
                text: filtered
                    ? 'جرّب تغيير الفلتر أو مسح كلمة البحث.'
                    : 'افتح تذكرة جديدة وسيتواصل معك فريق الدعم.'
            });
            clearTicketPanel();
            return;
        }

        list.innerHTML = cachedTickets.map(t => `
            <button type="button" class="ticket-card${ticketNeedsCustomerReply(t) ? ' needs-reply' : ''}" data-id="${escapeHtml(t.id)}" role="listitem">
                <span class="ticket-card-top">
                    <span class="ticket-num">#${escapeHtml(String(t.ticket_number || '---'))}</span>
                    ${statusBadge(t.status)}
                </span>
                <span class="ticket-title">${escapeHtml(t.title)}</span>
                <span class="ticket-badges-row">
                    ${priorityBadge(t.priority, { onlyHigh: true })}
                    ${categoryBadge(t.category)}
                </span>
                <span class="ticket-footer-row">
                    <span>${escapeHtml(new Date(t.created_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }))}</span>
                    ${ticketNeedsCustomerReply(t) ? '<span class="pill status-in-progress">بانتظار ردّك</span>' : ''}
                </span>
                ${slaFriendlyHint(t)}
            </button>`).join('');

        list.querySelectorAll('.ticket-card').forEach(card => {
            card.addEventListener('click', () => {
                list.querySelectorAll('.ticket-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                const ticket = cachedTickets.find(t => t.id === card.dataset.id);
                if (ticket) showTicketInPanel(ticket);
            });
        });

        // إعادة اختيار التذكرة المفتوحة إن كانت لسه في القائمة، وإلا أول تذكرة
        const keep = currentTicketId && cachedTickets.find(t => t.id === currentTicketId);
        const target = keep || cachedTickets[0];
        const targetCard = list.querySelector(`.ticket-card[data-id="${CSS.escape(target.id)}"]`);
        if (targetCard) targetCard.classList.add('selected');
        showTicketInPanel(target);
    }

    function clearTicketPanel() {
        currentTicketId = null;
        const panel = document.getElementById('ticketDetailsContent');
        if (!panel) return;
        renderState(panel, {
            variant: 'empty',
            title: 'اختر تذكرة لعرض تفاصيلها',
            text: 'التفاصيل والردود وسجل التذكرة ستظهر هنا.'
        });
    }

    function attachmentPreview(att) {
        const isImage = (att.mime_type || '').startsWith('image/');
        const url = sanitizeUrl(att.file_url);
        if (isImage && url) {
            return `<img src="${url}" alt="${escapeHtml(att.file_name || 'مرفق')}" loading="lazy">`;
        }
        return `<span class="att-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>`;
    }

    async function showTicketInPanel(ticket) {
        currentTicketId = ticket.id;
        const panel = document.getElementById('ticketDetailsContent');
        if (!panel) return;

        renderSkeletonLines(panel, 5);

        // التقييم يظهر فقط لو الأدمن سامح بيه (allow_ticket_rating)
        const ratingAllowed = cx.allow_ticket_rating && ticket.status === 'resolved';

        const [attachments, tags, activity, existingRating] = await Promise.all([
            fetchTicketAttachments(ticket.id).catch(() => []),
            fetchTicketTags(ticket.id).catch(() => []),
            fetchTicketActivity(ticket.id).catch(() => []),
            ratingAllowed ? fetchTicketRating(ticket.id).catch(() => null) : Promise.resolve(null)
        ]);

        // توافق مع تذاكر قديمة كانت تخزّن صورة واحدة في image_url
        const legacyImage = (ticket.image_url && !attachments.some(a => a.file_url === ticket.image_url))
            ? [{ file_url: ticket.image_url, file_name: 'مرفق', mime_type: 'image/*' }]
            : [];
        const allAttachments = [...attachments, ...legacyImage];

        const visibleActivity = (activity || []).filter(a => !CUSTOMER_HIDDEN_ACTIVITY_TYPES.has(a.action_type));

        panel.innerHTML = `
            <div class="ticket-detail-head">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:var(--sp-3); flex-wrap:wrap;">
                    <h2 class="ticket-detail-title">${escapeHtml(ticket.title)}</h2>
                    ${statusBadge(ticket.status)}
                </div>
                <div class="ticket-badges-row" style="margin-top:var(--sp-3);">
                    ${priorityBadge(ticket.priority)}
                    ${categoryBadge(ticket.category)}
                    ${(tags || []).map(t => `<span class="tag-chip" style="background:${escapeHtml(t.color)}22;color:${escapeHtml(t.color)}">${escapeHtml(t.name)}</span>`).join('')}
                </div>
                <div class="ticket-detail-meta">
                    <span>رقم التذكرة: <strong>#${escapeHtml(String(ticket.ticket_number || '---'))}</strong></span>
                    <span>أُنشئت ${escapeHtml(formatDate(ticket.created_at))}</span>
                    ${ticket.resolved_at ? `<span>حُلّت ${escapeHtml(formatDate(ticket.resolved_at))}</span>` : ''}
                </div>
                ${slaFriendlyHint(ticket)}
            </div>

            <div class="detail-section">
                <h3 class="detail-section-title">وصف المشكلة</h3>
                <p class="detail-body">${escapeHtml(ticket.description)}</p>
            </div>

            ${allAttachments.length ? `
            <div class="detail-section">
                <h3 class="detail-section-title">المرفقات (${allAttachments.length})</h3>
                <div class="attachments-grid">
                    ${allAttachments.map(a => `
                        <a class="attachment-item" href="${sanitizeUrl(a.file_url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(a.file_name || '')}">
                            ${attachmentPreview(a)}
                            <span class="att-name">${escapeHtml(a.file_name || 'مرفق')}</span>
                        </a>`).join('')}
                </div>
            </div>` : ''}

            ${ratingAllowed ? `
            <div class="detail-section">
                <div class="panel" style="margin:0; padding:var(--sp-4);">
                    <h3 class="detail-section-title" style="margin-bottom:var(--sp-3);">تقييمك للخدمة</h3>
                    <div id="ratingContainer">
                        ${existingRating ? `
                            <div class="rating-submitted">
                                <span style="color:#F5A623;">${'★'.repeat(existingRating.rating)}${'☆'.repeat(5 - existingRating.rating)}</span>
                                <span>شكراً لتقييمك</span>
                            </div>
                            ${existingRating.comment ? `<p class="detail-body u-muted" style="margin-top:.5rem; font-size:var(--fs-sm);">${escapeHtml(existingRating.comment)}</p>` : ''}
                        ` : `
                            <div class="star-rating" id="panelStarRating" role="radiogroup" aria-label="تقييم الخدمة من 1 إلى 5">
                                ${[1, 2, 3, 4, 5].map(v => `<button type="button" class="star" data-value="${v}" role="radio" aria-checked="false" aria-label="${v} من 5">★</button>`).join('')}
                            </div>
                            <label class="visually-hidden" for="panelRatingComment">تعليق على التقييم</label>
                            <textarea id="panelRatingComment" class="form-control" rows="2" style="margin-top:var(--sp-3);" placeholder="أضف تعليقاً (اختياري)…"></textarea>
                            <button type="button" id="panelSubmitRating" class="btn btn-primary" style="margin-top:var(--sp-3);" disabled>إرسال التقييم</button>
                        `}
                    </div>
                </div>
            </div>` : ''}

            ${visibleActivity.length ? `
            <div class="detail-section">
                <h3 class="detail-section-title">سجل التذكرة</h3>
                <div class="activity-timeline">
                    ${visibleActivity.slice(0, 8).map(a => `
                        <div class="activity-item">
                            <span class="activity-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
                            <div>
                                <div class="activity-text">${escapeHtml(ACTIVITY_LABELS[a.action_type] || a.action_type)}${a.action_type === 'status_change' && a.to_value ? ` — ${escapeHtml(STATUS_LABELS[a.to_value] || a.to_value)}` : ''}</div>
                                <div class="activity-time">${escapeHtml(timeAgo(a.created_at))}</div>
                            </div>
                        </div>`).join('')}
                </div>
            </div>` : ''}

            <div class="detail-section" style="border-top:1px solid var(--color-border); padding-top:var(--sp-5);">
                <h3 class="detail-section-title" style="font-size:var(--fs-base);">الردود</h3>
                <div id="panelRepliesList" class="replies-scroll"></div>
                <label class="visually-hidden" for="panelReplyText">اكتب ردك</label>
                <textarea id="panelReplyText" class="form-control" rows="3" placeholder="اكتب ردك هنا…"></textarea>
                <button type="button" id="panelSendReply" class="btn btn-primary btn-block" style="margin-top:var(--sp-3);">إرسال الرد</button>
            </div>

            <div style="display:flex; gap:var(--sp-3); border-top:1px solid var(--color-border); padding-top:var(--sp-5); flex-wrap:wrap;">
                ${cx.support_whatsapp ? `
                <button type="button" id="followUpWhatsApp" class="btn" style="flex:1; min-width:12rem; background:#25D366; color:#fff; border:none;">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.383 0 0 5.383 0 12s5.383 12 12 12 12-5.383 12-12S18.617 0 12 0zm5.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
                    متابعة على الواتساب
                </button>` : ''}
                <button type="button" id="archiveTicket" class="btn btn-secondary" style="flex:1; min-width:12rem;">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                    إخفاء من قائمتي
                </button>
            </div>`;

        await loadRepliesInPanel(ticket.id);
        wireRatingWidget(ticket);
        wireTicketActions(ticket);
    }

    function wireRatingWidget(ticket) {
        const starsEl = document.getElementById('panelStarRating');
        const submitBtn = document.getElementById('panelSubmitRating');
        if (!starsEl || !submitBtn) return;

        let selected = 0;
        const stars = Array.from(starsEl.querySelectorAll('.star'));
        const paint = (value) => stars.forEach(s => {
            const on = Number(s.dataset.value) <= value;
            s.classList.toggle('active', on);
            s.setAttribute('aria-checked', String(Number(s.dataset.value) === value));
        });

        stars.forEach(star => {
            star.addEventListener('mouseenter', () => paint(Number(star.dataset.value)));
            star.addEventListener('mouseleave', () => paint(selected));
            star.addEventListener('click', () => {
                selected = Number(star.dataset.value);
                paint(selected);
                submitBtn.disabled = false;
            });
        });

        submitBtn.addEventListener('click', async () => {
            if (!selected) return;
            const comment = document.getElementById('panelRatingComment')?.value.trim() || '';
            submitBtn.disabled = true;
            submitBtn.textContent = 'جاري الإرسال…';
            try {
                await submitTicketRating(ticket.id, selected, comment);
                const container = document.getElementById('ratingContainer');
                if (container) {
                    container.innerHTML = `
                        <div class="rating-submitted">
                            <span style="color:#F5A623;">${'★'.repeat(selected)}${'☆'.repeat(5 - selected)}</span>
                            <span>شكراً لتقييمك</span>
                        </div>
                        ${comment ? `<p class="detail-body u-muted" style="margin-top:.5rem; font-size:var(--fs-sm);">${escapeHtml(comment)}</p>` : ''}`;
                }
                ui.showToast('تم تسجيل تقييمك، شكراً لك', 'success');
            } catch (err) {
                ui.showToast(`تعذّر إرسال التقييم: ${err.message || 'خطأ غير متوقع'}`, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = 'إرسال التقييم';
            }
        });
    }

    function wireTicketActions(ticket) {
        // واتساب — الرقم من إعدادات الأدمن، والزر أصلاً مش موجود لو مفيش رقم
        document.getElementById('followUpWhatsApp')?.addEventListener('click', () => {
            const summary = [
                `*تفاصيل التذكرة #${ticket.ticket_number}*`,
                '',
                `*العنوان:* ${ticket.title}`,
                `*الحالة:* ${STATUS_LABELS[ticket.status] || ticket.status}`,
                `*تاريخ الإنشاء:* ${new Date(ticket.created_at).toLocaleDateString('ar-EG')}`,
                '',
                '*الوصف:*',
                ticket.description
            ].join('\n');
            window.open(
                `https://wa.me/${encodeURIComponent(cx.support_whatsapp)}?text=${encodeURIComponent(summary)}`,
                '_blank',
                'noopener'
            );
        });

        // "إخفاء من قائمتي" = أرشفة عند العميل فقط. التذكرة وسجلها يبقيان
        // محفوظين بالكامل لدى فريق الدعم — والنص بيقول كده صراحةً.
        document.getElementById('archiveTicket')?.addEventListener('click', async () => {
            const confirmed = await ui.showConfirm(
                'إخفاء التذكرة من قائمتك؟',
                `التذكرة #${ticket.ticket_number} لن تظهر بعد الآن في قائمتك، لكنها ستبقى محفوظة بالكامل لدى فريق الدعم ويمكنهم متابعتها والرد عليها.`,
                { confirmLabel: 'إخفاء', cancelLabel: 'تراجع', type: 'warning' }
            );
            if (!confirmed) return;

            try {
                await deleteTicket(ticket.id);
                currentTicketId = null;
                await Promise.all([renderStats(), renderTickets()]);
                ui.showToast('تم إخفاء التذكرة من قائمتك', 'success');
            } catch (err) {
                console.error('[Tickets] archive:', err);
                ui.showToast(`تعذّر إخفاء التذكرة: ${err.message || 'خطأ غير متوقع'}`, 'error');
            }
        });

        // إرسال رد
        const sendBtn = document.getElementById('panelSendReply');
        const replyInput = document.getElementById('panelReplyText');
        if (!sendBtn || !replyInput) return;

        const send = async () => {
            const message = replyInput.value.trim();
            if (!message) {
                ui.showToast('اكتب نص الرد أولاً', 'warning');
                replyInput.focus();
                return;
            }
            sendBtn.disabled = true;
            sendBtn.textContent = 'جاري الإرسال…';
            try {
                await addTicketReply(ticket.id, message);
                replyInput.value = '';
                await loadRepliesInPanel(ticket.id);
                ui.showToast('تم إرسال ردك', 'success');
            } catch (err) {
                ui.showToast(`تعذّر إرسال الرد: ${err.message || 'خطأ غير متوقع'}`, 'error');
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = 'إرسال الرد';
            }
        };

        sendBtn.addEventListener('click', send);
        // Ctrl/Cmd + Enter اختصار شائع لإرسال الرد
        replyInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                send();
            }
        });
    }

    const STAFF_ROLES = new Set(['admin', 'support', 'super_user']);

    async function loadRepliesInPanel(ticketId) {
        const list = document.getElementById('panelRepliesList');
        if (!list) return;

        renderSkeletonLines(list, 2);

        try {
            const replies = await fetchTicketReplies(ticketId);
            if (!replies.length) {
                renderState(list, { variant: 'empty', icon: false, title: 'لا توجد ردود بعد', text: 'سيظهر رد فريق الدعم هنا فور وصوله.' });
                return;
            }

            list.innerHTML = replies.map(r => {
                const isStaff = STAFF_ROLES.has(r.profiles?.role);
                return `
                    <div class="reply-item ${isStaff ? 'reply-item--staff' : ''}">
                        <div class="reply-head">
                            <span class="reply-author">${escapeHtml(isStaff ? (r.profiles?.full_name || 'فريق الدعم') : (r.profiles?.full_name || 'أنت'))}${isStaff ? ' <span class="pill status-open">الدعم</span>' : ''}</span>
                            <span class="reply-time">${escapeHtml(formatDateTime(r.created_at))}</span>
                        </div>
                        <p class="reply-text">${escapeHtml(r.message)}</p>
                    </div>`;
            }).join('');
            list.scrollTop = list.scrollHeight;
        } catch (err) {
            console.error('[Tickets] replies:', err);
            renderState(list, { variant: 'error', icon: false, title: 'تعذّر تحميل الردود' });
        }
    }

    /* ================= إنشاء تذكرة ================= */

    const createTicketModal = document.getElementById('createTicketModal');
    const createTicketForm = document.getElementById('userCreateTicketForm');
    let pendingAttachments = [];

    function openCreateTicketModal() {
        if (isGuest) {
            ui.showToast('سجّل الدخول أولاً لإنشاء تذكرة', 'info');
            return;
        }
        if (!createTicketModal) return;

        // المرفقات تظهر فقط لو الأدمن مفعّلها (allow_ticket_attachments)
        const attachField = document.getElementById('ticketAttachmentsField');
        if (attachField) attachField.hidden = !cx.allow_ticket_attachments;

        // منع الوصول للحد الأقصى للتذاكر المفتوحة (communication_control)
        const max = settings.limits?.max_open_tickets;
        const notice = document.getElementById('createTicketBlockedNotice');
        const submitBtn = document.getElementById('submitTicketBtn');
        const atLimit = !!max && openTicketCount >= max;

        if (notice && submitBtn) {
            if (atLimit) {
                notice.classList.remove('u-hidden');
                notice.innerHTML = `
                    <div class="alert-item alert-item--warning">
                        <span class="alert-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/><circle cx="12" cy="12" r="10"/></svg></span>
                        <div class="alert-body">
                            <p class="alert-title">وصلت للحد الأقصى للتذاكر المفتوحة</p>
                            <p class="alert-text">لديك ${openTicketCount} تذاكر مفتوحة والحد المسموح ${max}. تابع تذكرة قائمة أو انتظر حلّها قبل فتح تذكرة جديدة.</p>
                        </div>
                    </div>`;
                submitBtn.disabled = true;
            } else {
                notice.classList.add('u-hidden');
                notice.innerHTML = '';
                submitBtn.disabled = false;
            }
        }

        createTicketModal.classList.add('active');
        document.getElementById('userTicketTitle')?.focus();
    }

    function closeCreateTicketModal() {
        createTicketModal?.classList.remove('active');
        clearFieldError('userTicketTitle');
        clearFieldError('userTicketDescription');
    }

    document.addEventListener('click', (e) => {
        const opener = e.target.closest('[data-action="open-create-ticket"]');
        if (opener) {
            e.preventDefault();
            openCreateTicketModal();
            return;
        }

        const closer = e.target.closest('.close-modal');
        if (closer) {
            closer.closest('.modal')?.classList.remove('active');
            return;
        }

        // النقر خارج محتوى النافذة يغلقها
        if (e.target.classList?.contains('modal')) {
            e.target.classList.remove('active');
            return;
        }

        // أزرار التنقل داخل بطاقات المؤشرات والتنبيهات
        const goto = e.target.closest('[data-goto]');
        if (goto) {
            e.preventDefault();
            showSection(goto.dataset.goto);
            return;
        }

        // بطاقات مؤشرات التذاكر تعمل كفلاتر سريعة
        const filterCard = e.target.closest('[data-ticket-filter]');
        if (filterCard) {
            const value = filterCard.dataset.ticketFilter;
            const select = document.getElementById('ticketFilterStatus');
            if (select) select.value = value;
            currentFilters = { ...currentFilters, status: value };
            renderTickets(currentFilters);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelector('.modal.active')?.classList.remove('active');
        }
    });

    function showFieldError(fieldId, message) {
        const errorEl = document.getElementById(`${fieldId}Error`);
        const field = document.getElementById(fieldId);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('u-hidden');
        }
        if (field) field.setAttribute('aria-invalid', 'true');
    }

    function clearFieldError(fieldId) {
        const errorEl = document.getElementById(`${fieldId}Error`);
        const field = document.getElementById(fieldId);
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.classList.add('u-hidden');
        }
        if (field) field.removeAttribute('aria-invalid');
    }

    /* ================= المرفقات ================= */

    const attachmentsInput = document.getElementById('userTicketAttachments');
    const attachmentsChips = document.getElementById('ticketAttachmentsChips');

    function renderAttachmentChips() {
        if (!attachmentsChips) return;
        attachmentsChips.innerHTML = pendingAttachments.map((file, index) => `
            <span class="file-chip">
                <span class="u-truncate" style="max-width:11rem;">${escapeHtml(file.name)}</span>
                <button type="button" data-remove-attachment="${index}" aria-label="إزالة ${escapeHtml(file.name)}">×</button>
            </span>`).join('');
    }

    attachmentsInput?.addEventListener('change', () => {
        const incoming = Array.from(attachmentsInput.files || []);
        for (const file of incoming) {
            if (pendingAttachments.length >= MAX_ATTACHMENTS) {
                ui.showToast(`الحد الأقصى ${MAX_ATTACHMENTS} ملفات`, 'warning');
                break;
            }
            if (file.size > MAX_ATTACHMENT_BYTES) {
                ui.showToast(`الملف "${file.name}" أكبر من 5 ميجابايت ولم يُضَف`, 'warning');
                continue;
            }
            pendingAttachments.push(file);
        }
        attachmentsInput.value = '';
        renderAttachmentChips();
    });

    attachmentsChips?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-remove-attachment]');
        if (!btn) return;
        pendingAttachments.splice(Number(btn.dataset.removeAttachment), 1);
        renderAttachmentChips();
    });

    createTicketForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const titleEl = document.getElementById('userTicketTitle');
        const descEl = document.getElementById('userTicketDescription');
        const submitBtn = document.getElementById('submitTicketBtn');

        const title = titleEl.value.trim();
        const description = descEl.value.trim();
        const priority = document.getElementById('userTicketPriority').value;
        const category = document.getElementById('userTicketCategory').value;

        clearFieldError('userTicketTitle');
        clearFieldError('userTicketDescription');

        let hasError = false;
        if (title.length < 5) {
            showFieldError('userTicketTitle', 'اكتب عنواناً واضحاً (5 أحرف على الأقل)');
            hasError = true;
        }
        if (description.length < 15) {
            showFieldError('userTicketDescription', 'اشرح المشكلة بتفصيل أكبر (15 حرفاً على الأقل) ليتمكن الفريق من مساعدتك');
            hasError = true;
        }
        if (hasError) return;

        // منع التذاكر المكرّرة — إعداد يتحكم فيه الأدمن (communication_control)
        if (settings.limits?.prevent_duplicate_tickets) {
            const normalized = title.toLowerCase();
            const duplicate = cachedTickets.find(t =>
                t.status !== 'resolved' && (t.title || '').trim().toLowerCase() === normalized);
            if (duplicate) {
                const proceed = await ui.showConfirm(
                    'لديك تذكرة مفتوحة بنفس العنوان',
                    `التذكرة #${duplicate.ticket_number} بنفس العنوان ما زالت مفتوحة. المتابعة عليها أسرع من فتح تذكرة جديدة. هل تريد فتحها بدلاً من ذلك؟`,
                    { confirmLabel: 'افتح التذكرة القائمة', cancelLabel: 'أنشئ تذكرة جديدة', type: 'info' }
                );
                if (proceed) {
                    closeCreateTicketModal();
                    showSection('tickets');
                    currentTicketId = duplicate.id;
                    await renderTickets();
                    return;
                }
            }
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'جاري الإرسال…';

        try {
            // التصنيف بيتبعت مع الإنشاء نفسه: قاعدة البيانات بتمنع العميل من
            // تعديل التصنيف بعد كده (وده سلوك مقصود)، فالفرصة الوحيدة لضبطه
            // من واجهة العميل هي وقت الإنشاء.
            const ticket = await createTicket({ title, description, priority, category });

            // رفع المرفقات بعد إنشاء التذكرة (RLS بتربط المرفق بتذكرة موجودة)
            if (cx.allow_ticket_attachments && pendingAttachments.length) {
                const results = await Promise.allSettled(
                    pendingAttachments.map(file => uploadTicketAttachment(ticket.id, file))
                );
                const failed = results.filter(r => r.status === 'rejected').length;
                if (failed) {
                    ui.showToast(`تم إنشاء التذكرة، لكن تعذّر رفع ${failed} من المرفقات`, 'warning', 6000);
                }
            }

            createTicketForm.reset();
            pendingAttachments = [];
            renderAttachmentChips();
            closeCreateTicketModal();

            currentTicketId = ticket.id;
            await Promise.all([renderStats(), renderTickets()]);
            showSection('tickets');
            ui.showToast(`تم إنشاء التذكرة #${ticket.ticket_number ?? ''} بنجاح`, 'success');
        } catch (err) {
            console.error('[Tickets] create:', err);
            ui.showToast(`تعذّر إنشاء التذكرة: ${err.message || 'خطأ غير متوقع'}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'إرسال التذكرة';
        }
    });

    /* ================= فلاتر التذاكر ================= */

    const ticketFilterStatus = document.getElementById('ticketFilterStatus');
    const ticketSearchInput = document.getElementById('ticketSearchInput');
    let searchDebounce = null;

    ticketFilterStatus?.addEventListener('change', () => {
        currentFilters = { ...currentFilters, status: ticketFilterStatus.value };
        renderTickets(currentFilters);
    });

    ticketSearchInput?.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            currentFilters = { ...currentFilters, search: ticketSearchInput.value.trim() };
            renderTickets(currentFilters);
        }, 320);
    });

    /* =========================================================
       قسم: الإشعارات
    ========================================================= */

    let notificationFilter = 'all';

    async function refreshNotificationBadge() {
        if (isGuest) return;
        const result = await customerData.fetchUnreadNotificationsCount();
        if (result.ok) setSidebarBadge('notifications', result.data);
    }

    async function renderNotifications() {
        const container = document.getElementById('notificationsList');
        if (!container) return;

        renderSkeletonLines(container, 4);

        try {
            const all = await fetchNotifications();
            const items = notificationFilter === 'unread' ? all.filter(n => !n.is_read) : all;

            if (!items.length) {
                renderState(container, {
                    variant: 'empty',
                    title: notificationFilter === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات بعد',
                    text: 'ستصلك هنا تحديثات تذاكرك واشتراكاتك وأي إجراء يخص حسابك.'
                });
                return;
            }

            container.innerHTML = `<div class="data-rows">${items.map(n => `
                <div class="data-row" data-notification-id="${escapeHtml(n.id)}" style="cursor:${n.link ? 'pointer' : 'default'}; align-items:flex-start;">
                    <span class="data-row-label" style="flex-direction:column; align-items:flex-start; gap:.2rem; flex:1;">
                        <span style="color:var(--color-text); font-weight:700;">
                            ${!n.is_read ? '<span class="pill status-open" style="margin-left:.4rem;">جديد</span>' : ''}${escapeHtml(n.title)}
                        </span>
                        <span style="font-weight:500; line-height:1.6;">${escapeHtml(n.message)}</span>
                    </span>
                    <span class="data-row-value" style="font-weight:500; font-size:var(--fs-xs); color:var(--color-text-3);">
                        ${escapeHtml(formatRelativeArabic(n.created_at))}
                    </span>
                </div>`).join('')}</div>`;

            container.querySelectorAll('[data-notification-id]').forEach(row => {
                row.addEventListener('click', async () => {
                    const id = row.dataset.notificationId;
                    const notification = items.find(n => String(n.id) === String(id));
                    if (!notification) return;
                    if (!notification.is_read) {
                        await markAsRead(id).catch(err => console.error('[Notifications] markAsRead:', err));
                        refreshNotificationBadge();
                    }
                    if (notification.link) {
                        window.location.href = notification.link;
                    } else {
                        renderNotifications();
                    }
                });
            });
        } catch (err) {
            console.error('[Notifications] render:', err);
            renderState(container, { variant: 'error', title: 'تعذّر تحميل الإشعارات', text: 'حدّث الصفحة أو حاول بعد قليل.' });
        }
    }

    document.getElementById('notificationFilter')?.addEventListener('change', (e) => {
        notificationFilter = e.target.value;
        renderNotifications();
    });

    document.getElementById('markAllNotificationsBtn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            await markAllAsRead();
            await Promise.all([renderNotifications(), refreshNotificationBadge()]);
            ui.showToast('تم تحديد كل الإشعارات كمقروءة', 'success');
        } catch (err) {
            ui.showToast('تعذّر تحديث الإشعارات', 'error');
        } finally {
            btn.disabled = false;
        }
    });

    /* =========================================================
       قسم: الشارات
    ========================================================= */

    async function renderBadges() {
        const grid = document.getElementById('badgesGrid');
        const summaryEl = document.getElementById('badgesProgressSummary');
        if (!grid) return;

        if (isGuest) {
            renderState(grid, { variant: 'empty', title: 'سجّل الدخول لجمع الشارات', text: 'الشارات تُمنح تلقائياً مع استخدامك للمنصة.' });
            return;
        }

        grid.innerHTML = '<div class="skeleton skeleton-card"></div>'.repeat(6);

        const { supabase } = await import('./api-config.js');

        // تقييم فوري لشارات المستخدم (الدالة تعمل على نفس المستخدم المسجّل فقط)
        try {
            await supabase.rpc('evaluate_customer_badges', { p_user_id: user.id });
        } catch (err) {
            console.warn('[Badges] evaluate skipped:', err?.message || err);
        }

        try {
            const [{ data: definitions, error: defError }, { data: earned, error: earnedError }] = await Promise.all([
                supabase.from('badge_definitions')
                    .select('id, key, name, description, icon, sort_order')
                    .eq('is_active', true)
                    .order('sort_order', { ascending: true }),
                supabase.from('customer_badges')
                    .select('badge_id, earned_at')
                    .eq('user_id', user.id)
            ]);
            if (defError) throw defError;
            if (earnedError) throw earnedError;

            const earnedMap = new Map((earned || []).map(e => [e.badge_id, e.earned_at]));

            if (!definitions?.length) {
                renderState(grid, { variant: 'empty', title: 'لا توجد شارات متاحة حالياً' });
                if (summaryEl) summaryEl.textContent = '';
                return;
            }

            if (summaryEl) summaryEl.textContent = `حصلت على ${earnedMap.size} من ${definitions.length} شارة`;
            setSidebarBadge('badges', 0);

            grid.innerHTML = definitions.map(badge => {
                const earnedAt = earnedMap.get(badge.id);
                return `
                    <div class="badge-card ${earnedAt ? 'earned' : 'locked'}" title="${earnedAt ? 'شارة مكتسبة' : 'لم تحصل عليها بعد'}">
                        ${!earnedAt ? '<span class="badge-locked-tag">🔒</span>' : ''}
                        <div class="badge-icon">${escapeHtml(badge.icon || '🏆')}</div>
                        <h3>${escapeHtml(badge.name)}</h3>
                        <p>${escapeHtml(badge.description || '')}</p>
                        ${earnedAt ? `<div class="badge-earned-date">✓ ${escapeHtml(formatDate(earnedAt))}</div>` : ''}
                    </div>`;
            }).join('');
        } catch (err) {
            console.error('[Badges] load:', err);
            renderState(grid, { variant: 'error', title: 'تعذّر تحميل الشارات', text: 'حدّث الصفحة وحاول مرة أخرى.' });
        }
    }

    /* =========================================================
       قسم: الملف الشخصي  (كان بلا أي معالجات قبل هذا التعديل)
    ========================================================= */

    let profileBaseline = { full_name: '', phone: '', bio: '' };

    async function renderProfileSection() {
        const result = await customerData.fetchAccountStatus();
        const summary = document.getElementById('profileSecuritySummary');

        if (!result.ok) {
            renderState(summary, { variant: 'error', title: 'تعذّر تحميل بيانات الحساب' });
            return;
        }

        const profile = result.data || {};
        profileBaseline = {
            full_name: profile.full_name || '',
            phone: profile.phone || '',
            bio: profile.bio || ''
        };

        const nameInput = document.getElementById('profileFullName');
        const phoneInput = document.getElementById('profilePhone');
        const emailInput = document.getElementById('profileEmail');
        const bioInput = document.getElementById('profileBio');
        if (nameInput) nameInput.value = profileBaseline.full_name;
        if (phoneInput) phoneInput.value = profileBaseline.phone;
        if (bioInput) bioInput.value = profileBaseline.bio;
        if (emailInput) emailInput.value = profile.email || user.email || '';

        if (summary) {
            const rows = [
                {
                    label: 'التحقق بخطوتين (2FA)',
                    value: profile.two_factor_enabled
                        ? '<span class="pill status-resolved"><span class="pill-dot"></span>مفعّل</span>'
                        : '<span class="pill status-neutral"><span class="pill-dot"></span>غير مفعّل</span>',
                    note: profile.two_factor_enabled ? '' : 'تفعيله يحمي حسابك حتى لو تسربت كلمة المرور.'
                },
                {
                    label: 'تنبيهات تيليجرام',
                    value: profile.telegram_otp_enabled
                        ? '<span class="pill status-resolved"><span class="pill-dot"></span>مفعّلة</span>'
                        : '<span class="pill status-neutral">غير مفعّلة</span>',
                    note: profile.telegram_username ? `الحساب المرتبط: ${profile.telegram_username}` : ''
                },
                {
                    label: 'آخر تغيير لكلمة المرور',
                    value: profile.last_password_change ? formatDate(profile.last_password_change) : 'غير مسجَّل',
                    note: ''
                },
                {
                    label: 'حالة التوثيق',
                    value: profile.is_verified
                        ? '<span class="pill status-resolved"><span class="pill-dot"></span>موثّق</span>'
                        : '<span class="pill status-neutral">غير موثّق</span>',
                    note: ''
                }
            ];

            summary.innerHTML = `<div class="data-rows">${rows.map(r => `
                <div class="data-row">
                    <span class="data-row-label">${escapeHtml(r.label)}</span>
                    <span class="data-row-value">${r.value}</span>
                    ${r.note ? `<p class="data-row-note">${escapeHtml(r.note)}</p>` : ''}
                </div>`).join('')}</div>`;
        }
    }

    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isGuest) return;

        const nameInput = document.getElementById('profileFullName');
        const phoneInput = document.getElementById('profilePhone');
        const saveBtn = document.getElementById('profileSaveBtn');

        const bioInput = document.getElementById('profileBio');
        const fullName = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        const bio = bioInput ? bioInput.value.trim() : profileBaseline.bio;

        clearFieldError('profileFullName');
        clearFieldError('profilePhone');

        if (fullName.length < 3) {
            showFieldError('profileFullName', 'الاسم يجب أن يكون 3 أحرف على الأقل');
            return;
        }
        if (phone && !/^[\d+\-\s()]{7,20}$/.test(phone)) {
            showFieldError('profilePhone', 'أدخل رقم هاتف صحيح');
            return;
        }
        if (fullName === profileBaseline.full_name
            && phone === profileBaseline.phone
            && bio === profileBaseline.bio) {
            ui.showToast('لا توجد تغييرات لحفظها', 'info');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'جاري الحفظ…';
        try {
            const { error } = await updateProfile({ full_name: fullName, phone: phone || null, bio });
            if (error) throw new Error(error.message);

            profileBaseline = { full_name: fullName, phone, bio };
            if (user.profile) user.profile.full_name = fullName;
            updateSidebarUserInfo();
            document.getElementById('overviewHeading').textContent = `مرحباً، ${fullName}`;
            ui.showToast('تم حفظ بياناتك', 'success');
        } catch (err) {
            console.error('[Profile] update:', err);
            ui.showToast(`تعذّر حفظ البيانات: ${err.message || 'خطأ غير متوقع'}`, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'حفظ التغييرات';
        }
    });

    document.getElementById('profileResetBtn')?.addEventListener('click', () => {
        document.getElementById('profileFullName').value = profileBaseline.full_name;
        document.getElementById('profilePhone').value = profileBaseline.phone;
        const bioInput = document.getElementById('profileBio');
        if (bioInput) bioInput.value = profileBaseline.bio;
        clearFieldError('profileFullName');
        clearFieldError('profilePhone');
    });

    document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isGuest) return;

        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const saveBtn = document.getElementById('passwordSaveBtn');

        clearFieldError('newPassword');
        clearFieldError('confirmPassword');

        if (newPassword.length < 8) {
            showFieldError('newPassword', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل');
            return;
        }
        if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
            showFieldError('newPassword', 'يجب أن تحتوي كلمة المرور على حرف ورقم على الأقل');
            return;
        }
        if (newPassword !== confirmPassword) {
            showFieldError('confirmPassword', 'كلمتا المرور غير متطابقتين');
            return;
        }

        const confirmed = await ui.showConfirm(
            'تحديث كلمة المرور؟',
            'سيتم تغيير كلمة مرور حسابك. استخدم كلمة المرور الجديدة في تسجيل الدخول القادم.',
            { confirmLabel: 'تحديث', cancelLabel: 'تراجع', type: 'warning' }
        );
        if (!confirmed) return;

        saveBtn.disabled = true;
        saveBtn.textContent = 'جاري التحديث…';
        try {
            const { error } = await updatePassword(newPassword);
            if (error) throw new Error(error.message);

            document.getElementById('changePasswordForm').reset();
            ui.showToast('تم تحديث كلمة المرور بنجاح', 'success');
            renderProfileSection();
        } catch (err) {
            console.error('[Profile] password:', err);
            ui.showToast(`تعذّر تحديث كلمة المرور: ${err.message || 'خطأ غير متوقع'}`, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = 'تحديث كلمة المرور';
        }
    });

    /* =========================================================
       التهيئة
    ========================================================= */

    if (cx.enable_rewards_system && !isGuest) {
        initRewardsDashboard(user);
    }

    document.getElementById('overviewRefreshBtn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            await Promise.all([renderOverview(), renderStats(), refreshNotificationBadge()]);
            ui.showToast('تم تحديث البيانات', 'success', 2500);
        } finally {
            btn.disabled = false;
        }
    });

    await Promise.all([
        renderOverview(),
        renderStats(),
        renderTickets()
    ]);

    // القسم الابتدائي من عنوان الصفحة (يسمح بروابط مباشرة مثل #tickets)
    showSection(window.location.hash.slice(1) || 'overview', { updateHash: false });

    /* ================= التحديث اللحظي ================= */

    if (!isGuest) {
        subscribeToTickets(() => {
            Promise.all([renderStats(), renderTickets()]);
            if (currentSection === 'overview') renderOverview();
        });

        subscribeToNotifications(user.id, () => {
            refreshNotificationBadge();
            if (currentSection === 'notifications') renderNotifications();
        });
    }

    /* ================= تسجيل الخروج ================= */
    // تسجيل الخروج مربوط بالكامل في customer-sidebar.js على العنصرين
    // #customerSignOut و #sidebarSignOut (وهما الزرّان الوحيدان الموجودان
    // فعلياً في الواجهة). مفيش معالج مكرر هنا.

})();
