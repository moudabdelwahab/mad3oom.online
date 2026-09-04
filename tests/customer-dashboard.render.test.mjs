/**
 * اختبارات عرض لوحة العميل — تشغّل الصفحة الحقيقية في متصفح Chromium فعلي
 * مقابل بديل اختباري لـ Supabase/auth، فتتنفّذ كل وحدات الرسم الحقيقية
 * (customer-dashboard.js وما تستورده) بدون أي اتصال بقاعدة بيانات.
 *
 * كل اختبار هنا يثبّت سلوكًا طلبه التكامل مع لوحة الإدارة، بحيث أي تعديل
 * لاحق يفصل اللوحتين عن بعض يفشل هنا.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

function startServer() {
    const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        const filePath = path.join(ROOT, urlPath === '/' ? '/index.html' : urlPath);
        if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            res.writeHead(404); res.end('not found'); return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const USER_ID = '11111111-1111-1111-1111-111111111111';

/** إعدادات المنصة كما ترجّعها get_customer_platform_settings(). */
function platformSettings(overrides = {}) {
    return {
        customer_experience: {
            welcome_message: 'أهلاً بك في مدعوم، فريقنا معك.',
            enable_rewards_system: true,
            allow_ticket_attachments: true,
            allow_ticket_rating: true,
            show_support_online_status: true,
            support_whatsapp: '201234567890',
            ...(overrides.customer_experience || {})
        },
        sla: { enabled: true, high_hours: 1, medium_hours: 2, low_hours: 4, ...(overrides.sla || {}) },
        limits: { max_open_tickets: 5, prevent_duplicate_tickets: true, ticket_retention_days: 365, ...(overrides.limits || {}) },
        branding: { site_name: 'مدعوم', primary_color: '#0077CC' },
        support: {
            working_hours: Array.from({ length: 7 }, (_, d) => ({
                day_of_week: d, is_working_day: d !== 5, start_time: '09:00:00', end_time: '17:00:00'
            })),
            is_online_now: true,
            ...(overrides.support || {})
        }
    };
}

function fixtures(overrides = {}) {
    const settings = platformSettings(overrides.settings || {});
    return {
        user: { id: USER_ID, email: 'client@example.com' },
        authUser: {
            id: USER_ID,
            email: 'client@example.com',
            profile: { id: USER_ID, full_name: 'عميل تجريبي', role: 'user' }
        },
        rpc: {
            get_customer_platform_settings: settings,
            evaluate_customer_badges: null
        },
        tables: {
            profiles: [{
                id: USER_ID, email: 'client@example.com', full_name: 'عميل تجريبي', phone: '0100000000',
                role: 'user', created_at: '2026-01-01T00:00:00Z', is_verified: true, points: 120,
                ban_status: 'active', whatsapp_enabled: true, two_factor_enabled: false,
                telegram_otp_enabled: false, last_password_change: '2026-06-01T00:00:00Z'
            }],
            tickets: [
                {
                    id: 't1', user_id: USER_ID, ticket_number: 101, title: 'مشكلة في تسجيل الدخول',
                    description: 'لا أستطيع الدخول من الموبايل', status: 'open', priority: 'high',
                    category: 'login', created_at: '2026-09-01T09:00:00Z',
                    last_updated_by: 'admin-id', archived_by_customer: false,
                    sla_response_due_at: '2099-01-01T00:00:00Z', first_response_at: null
                },
                {
                    id: 't2', user_id: USER_ID, ticket_number: 102, title: 'استفسار عن الفاتورة',
                    description: 'أريد نسخة من فاتورة أغسطس', status: 'resolved', priority: 'medium',
                    category: 'subscription', created_at: '2026-08-01T09:00:00Z',
                    resolved_at: '2026-08-02T09:00:00Z', last_updated_by: USER_ID,
                    archived_by_customer: false, first_response_at: '2026-08-01T11:00:00Z'
                }
            ],
            ticket_replies: [{
                id: 'r1', ticket_id: 't1', user_id: 'admin-id', message: 'راجعنا المشكلة ونحتاج رقم الجهاز',
                created_at: '2026-09-01T10:00:00Z', is_internal: false,
                profiles: { full_name: 'فريق الدعم', role: 'admin' }
            }],
            ticket_activity: [
                { id: 'a1', ticket_id: 't1', action_type: 'create', created_at: '2026-09-01T09:00:00Z' },
                { id: 'a2', ticket_id: 't1', action_type: 'status_change', to_value: 'open', created_at: '2026-09-01T09:05:00Z' }
            ],
            ticket_attachments: [],
            ticket_tag_links: [],
            ticket_ratings: [],
            notifications: [
                { id: 'n1', user_id: USER_ID, title: 'رد جديد على تذكرتك', message: 'فريق الدعم رد على التذكرة #101', is_read: false, created_at: '2026-09-01T10:01:00Z', link: null },
                { id: 'n2', user_id: USER_ID, title: 'تم حل تذكرتك', message: 'التذكرة #102 تم حلها', is_read: true, created_at: '2026-08-02T09:00:00Z', link: null }
            ],
            services: [
                { id: 's1', name: 'API الرئيسية', status: 'operational', response_time: 45 },
                { id: 's2', name: 'خدمة الإشعارات', status: 'degraded', response_time: 450 }
            ],
            incidents: [],
            activity_logs: [{ id: 'l1', user_id: USER_ID, action: 'login', created_at: '2026-09-04T08:00:00Z', device_info: 'Chrome' }],
            badge_definitions: [
                { id: 'b1', key: 'first_ticket', name: 'أول تذكرة', description: 'فتحت أول تذكرة', icon: '🎫', is_active: true, sort_order: 10 },
                { id: 'b2', key: 'active_user', name: 'المستخدم النشط', description: '10 تذاكر', icon: '⚡', is_active: true, sort_order: 20 }
            ],
            customer_badges: [{ id: 'cb1', user_id: USER_ID, badge_id: 'b1', earned_at: '2026-09-01T09:00:00Z' }],
            customer_subscriptions: [],
            subscription_plans: [],
            plan_features: [],
            feature_flags: [{ key: 'api_tokens', name: 'API Access', name_ar: 'مفاتيح API', description: '' }],
            whatsapp_subscriptions: [],
            whatsapp_wallets: [{ id: 'w1', user_id: USER_ID, balance: 12, currency: 'EGP', low_balance_threshold: 20, updated_at: '2026-09-01T00:00:00Z' }],
            whatsapp_wallet_transactions: [],
            customer_sie_access: [{ user_id: USER_ID, is_enabled: true, access_mode: 'quota', message_quota: 100, messages_used: 95, expires_at: null }],
            subdomain_requests: [],
            api_tokens: [],
            api_token_usage_logs: [],
            user_wallets: [{ user_id: USER_ID, total_points: 120, available_points: 100, pending_points: 20, membership_level: 'عضو نشط', is_pro: false }],
            user_reports: [],
            trusted_devices: []
        },
        ...(overrides.extra || {})
    };
}

/** يفتح اللوحة في متصفح حقيقي مع اعتراض وحدات Supabase/auth واستبدالها بالبدائل. */
async function openDashboard(browser, baseUrl, fx, { hash = '' } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();

    const doubleSupabase = fs.readFileSync(path.join(ROOT, 'tests/fixtures/supabase-double.js'), 'utf8');
    const doubleAuth = fs.readFileSync(path.join(ROOT, 'tests/fixtures/auth-client-double.js'), 'utf8');

    await page.route('**/api-config.js', route =>
        route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: doubleSupabase }));
    await page.route('**/auth-client.js', route =>
        route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: doubleAuth }));
    // وحدات ثقيلة وغير متعلقة بما نختبره
    await page.route('**/chat-widget.js', r => r.fulfill({ contentType: 'text/javascript', body: 'export default {};' }));
    await page.route('**/robot.js', r => r.fulfill({ contentType: 'text/javascript', body: 'export default {};' }));
    await page.route('**/ads-ticker.js', r => r.fulfill({ contentType: 'text/javascript', body: 'export default {};' }));
    await page.route('**/error-tracker.js', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route('**/chat-service.js', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ contentType: 'text/css', body: '' }));

    await page.addInitScript(data => { window.__FIXTURES__ = data; }, fx);

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${baseUrl}/customer-dashboard.html${hash}`, { waitUntil: 'networkidle' });
    // القائمة الجانبية تُحقن بعد fetch، وبعدها بيبدأ الرسم — ننتظرها كإشارة
    // على اكتمال التهيئة، مش عنصرًا في قسم بعينه (الأقسام غير النشطة مخفية).
    await page.waitForSelector('.sidebar-item[data-tab="tickets"]', { timeout: 10000 });
    await page.waitForFunction(
        () => document.querySelector('#overviewKpis .kpi-value')?.textContent.trim() !== '',
        null,
        { timeout: 10000 }
    );
    return { page, context, errors };
}

/**
 * يحدّد مسار Chromium: التنزيل الافتراضي لـPlaywright أولاً، ثم
 * PLAYWRIGHT_BROWSERS_PATH، وإلا نتخطى الاختبارات بصوت عالٍ (زي
 * run-sql-tests.sh) بدل ما ندّعي نجاحها على جهاز من غير متصفح.
 */
function resolveChromium() {
    try {
        const p = chromium.executablePath();
        if (p && fs.existsSync(p)) return p;
    } catch { /* لا تنزيل افتراضي */ }

    const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
    if (root && fs.existsSync(root)) {
        for (const dir of fs.readdirSync(root).filter(d => d.startsWith('chromium')).sort().reverse()) {
            for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome']) {
                const candidate = path.join(root, dir, rel);
                if (fs.existsSync(candidate)) return candidate;
            }
        }
    }
    return null;
}

let server, baseUrl, browser;
const chromiumPath = resolveChromium();

if (!chromiumPath) {
    console.error('SKIP: لا يوجد متصفح Chromium متاح؛ اختبارات عرض لوحة العميل لم تُنفَّذ');
}

test.before(async (t) => {
    if (!chromiumPath) return;
    server = await startServer();
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ executablePath: chromiumPath });
});

test.after(async () => {
    await browser?.close();
    server?.close();
});

test('اللوحة تُحمَّل وتعرض رسالة الترحيب التي يضبطها الأدمن', { skip: !chromiumPath }, async () => {
    const { page, context, errors } = await openDashboard(browser, baseUrl, fixtures());
    const welcome = await page.textContent('#overviewWelcomeMessage');
    assert.equal(welcome.trim(), 'أهلاً بك في مدعوم، فريقنا معك.');
    assert.match(await page.textContent('#overviewHeading'), /عميل تجريبي/);
    assert.deepEqual(errors, [], `أخطاء في الصفحة: ${errors.join(' | ')}`);
    await context.close();
});

test('المؤشرات مبنية على تذاكر العميل الحقيقية وليست قيماً ثابتة', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures());
    const kpis = await page.$$eval('#overviewKpis .kpi', els =>
        els.map(el => ({
            label: el.querySelector('.kpi-label').textContent.trim(),
            value: el.querySelector('.kpi-value').textContent.trim()
        })));
    const open = kpis.find(k => k.label === 'تذاكر مفتوحة');
    const awaiting = kpis.find(k => k.label === 'بانتظار ردّك');
    assert.equal(open.value, '1');        // تذكرة واحدة مفتوحة في البيانات
    assert.equal(awaiting.value, '1');    // t1 آخر تحديث لها من الأدمن
    assert.equal(kpis.find(k => k.label === 'الشارات').value, '1/2');
    await context.close();
});

test('التنبيهات تظهر من حالة الحساب الفعلية (رصيد منخفض + حصة شبه منتهية)', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures());
    await page.waitForSelector('#overviewAlertsPanel:not([hidden])');
    const titles = await page.$$eval('#overviewAlertsList .alert-title', els => els.map(e => e.textContent.trim()));
    assert.ok(titles.some(t => t.includes('بانتظار ردّك')), `التنبيهات: ${titles}`);
    assert.ok(titles.some(t => t.includes('رصيد الواتساب منخفض')), `التنبيهات: ${titles}`);
    assert.ok(titles.some(t => t.includes('حصة المحرك الذكي')), `التنبيهات: ${titles}`);
    await context.close();
});

test('ساعات العمل وأهداف SLA تُعرض من إعدادات الأدمن', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures());
    const body = await page.textContent('#supportAvailabilityBody');
    assert.match(body, /متاح الآن/);
    assert.match(body, /عالية: 1 س/);
    assert.match(body, /متوسطة: 2 س/);
    assert.match(body, /6 أيام أسبوعياً/); // الجمعة إجازة في البيانات
    await context.close();
});

test('حالة النظام تعكس الخدمات المتعطّلة التي يديرها الأدمن', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures());
    const body = await page.textContent('#systemStatusBody');
    assert.match(body, /خدمة بها مشكلة حالياً/);
    assert.match(body, /خدمة الإشعارات/);
    await context.close();
});

test('إطفاء المكافآت من لوحة الإدارة يزيل القسم ورابطه من القائمة', { skip: !chromiumPath }, async () => {
    const fx = fixtures({ settings: { customer_experience: { enable_rewards_system: false } } });
    const { page, context } = await openDashboard(browser, baseUrl, fx);
    assert.equal(await page.locator('#rewardsTabContent').count(), 0);
    assert.equal(await page.locator('.sidebar-item[data-tab="rewards"]').count(), 0);
    await context.close();
});

test('إطفاء المرفقات من لوحة الإدارة يخفي حقل المرفقات في نموذج التذكرة', { skip: !chromiumPath }, async () => {
    const fx = fixtures({ settings: { customer_experience: { allow_ticket_attachments: false } } });
    const { page, context } = await openDashboard(browser, baseUrl, fx);
    await page.click('[data-action="open-create-ticket"]');
    await page.waitForSelector('#createTicketModal.active');
    assert.equal(await page.locator('#ticketAttachmentsField').isVisible(), false);
    await context.close();
});

test('تفعيل المرفقات يُظهر الحقل', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures());
    await page.click('[data-action="open-create-ticket"]');
    await page.waitForSelector('#createTicketModal.active');
    assert.equal(await page.locator('#ticketAttachmentsField').isVisible(), true);
    await context.close();
});

test('حد التذاكر المفتوحة من لوحة الإدارة يمنع الإرسال ويشرح السبب', { skip: !chromiumPath }, async () => {
    const fx = fixtures({ settings: { limits: { max_open_tickets: 1 } } });
    const { page, context } = await openDashboard(browser, baseUrl, fx);
    await page.click('[data-action="open-create-ticket"]');
    await page.waitForSelector('#createTicketModal.active');
    assert.equal(await page.locator('#submitTicketBtn').isDisabled(), true);
    assert.match(await page.textContent('#createTicketBlockedNotice'), /وصلت للحد الأقصى للتذاكر المفتوحة/);
    await context.close();
});

test('إطفاء التقييم من لوحة الإدارة يخفي أداة التقييم على التذكرة المحلولة', { skip: !chromiumPath }, async () => {
    const fx = fixtures({ settings: { customer_experience: { allow_ticket_rating: false } } });
    const { page, context } = await openDashboard(browser, baseUrl, fx, { hash: '#tickets' });
    await page.click('.ticket-card[data-id="t2"]');
    await page.waitForSelector('.ticket-detail-title');
    assert.equal(await page.locator('#panelStarRating').count(), 0);
    await context.close();
});

test('تفعيل التقييم يُظهر النجوم على التذكرة المحلولة فقط', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures(), { hash: '#tickets' });
    await page.click('.ticket-card[data-id="t2"]');
    await page.waitForSelector('#panelStarRating');
    assert.equal(await page.locator('#panelStarRating .star').count(), 5);

    await page.click('.ticket-card[data-id="t1"]'); // تذكرة مفتوحة
    await page.waitForSelector('.ticket-detail-title');
    assert.equal(await page.locator('#panelStarRating').count(), 0);
    await context.close();
});

test('سجل التذكرة يظهر للعميل (كان فارغاً دائماً قبل فتح صلاحية القراءة)', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures(), { hash: '#tickets' });
    await page.click('.ticket-card[data-id="t1"]');
    await page.waitForSelector('.ticket-details-scroll .activity-timeline');
    const items = await page.$$eval('.ticket-details-scroll .activity-timeline .activity-text', els => els.map(e => e.textContent.trim()));
    assert.ok(items.includes('تم إنشاء التذكرة'), `سجل التذكرة: ${items}`);
    await context.close();
});

test('رقم واتساب الدعم يأتي من الإعدادات، ويختفي الزر إن لم يُضبَط', { skip: !chromiumPath }, async () => {
    const withNumber = await openDashboard(browser, baseUrl, fixtures(), { hash: '#tickets' });
    await withNumber.page.click('.ticket-card[data-id="t1"]');
    await withNumber.page.waitForSelector('#followUpWhatsApp');
    await withNumber.context.close();

    const fx = fixtures({ settings: { customer_experience: { support_whatsapp: '' } } });
    const without = await openDashboard(browser, baseUrl, fx, { hash: '#tickets' });
    await without.page.click('.ticket-card[data-id="t1"]');
    await without.page.waitForSelector('.ticket-detail-title');
    assert.equal(await without.page.locator('#followUpWhatsApp').count(), 0);
    await without.context.close();
});

test('نموذج الملف الشخصي يحفظ فعلياً (كان بلا معالج قبل هذا التعديل)', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures(), { hash: '#profile' });
    await page.waitForSelector('#profileFullName');
    assert.equal(await page.inputValue('#profileFullName'), 'عميل تجريبي');

    await page.fill('#profileFullName', 'الاسم المحدَّث');
    await page.click('#profileSaveBtn');
    await page.waitForFunction(() => (window.__CALLS__ || []).some(c => c[0] === 'updateProfile'));
    const calls = await page.evaluate(() => window.__CALLS__);
    assert.equal(calls.find(c => c[0] === 'updateProfile')[1].full_name, 'الاسم المحدَّث');
    await context.close();
});

test('النبذة تُحفظ مع بيانات الملف الشخصي (لا محرِّر مكرر في نافذة الإعدادات)', { skip: !chromiumPath }, async () => {
    const fx = fixtures();
    fx.tables.profiles[0].bio = 'نبذة قديمة';
    const { page, context } = await openDashboard(browser, baseUrl, fx, { hash: '#profile' });
    await page.waitForSelector('#profileBio');
    assert.equal(await page.inputValue('#profileBio'), 'نبذة قديمة');

    await page.fill('#profileBio', 'نبذة محدَّثة');
    await page.click('#profileSaveBtn');
    await page.waitForFunction(() => (window.__CALLS__ || []).some(c => c[0] === 'updateProfile'));
    const call = (await page.evaluate(() => window.__CALLS__)).find(c => c[0] === 'updateProfile');
    assert.equal(call[1].bio, 'نبذة محدَّثة');

    // نافذة الإعدادات ما بقاش فيها محرِّر تاني لنفس البيانات
    assert.equal(await page.locator('#settings-modal-container [data-tab="account"]').count(), 0);
    assert.equal(await page.locator('#fullNameInput').count(), 0);
    assert.equal(await page.locator('#newPasswordInput').count(), 0);
    await context.close();
});

test('زر التراجع يعيد النموذج لحالته المحفوظة', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures(), { hash: '#profile' });
    await page.waitForSelector('#profileFullName');
    await page.fill('#profileFullName', 'اسم مؤقت');
    await page.fill('#profilePhone', '0999');
    await page.click('#profileResetBtn');
    assert.equal(await page.inputValue('#profileFullName'), 'عميل تجريبي');
    assert.equal(await page.inputValue('#profilePhone'), '0100000000');
    await context.close();
});

test('المساعد العائم لا يختفي تحت القائمة الثابتة على الشاشات الكبيرة', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures());
    // نحقن حاوية المساعد يدويًا لأن robot.js مستبدَل في بيئة الاختبار
    await page.evaluate(() => {
        const el = document.createElement('div');
        el.className = 'robot-container';
        el.style.width = '60px';
        el.style.height = '60px';
        document.body.appendChild(el);
    });
    const right = await page.evaluate(() =>
        getComputedStyle(document.querySelector('.robot-container')).right);
    assert.equal(right, '320px', 'يجب أن يزاح المساعد بعرض القائمة (290) + 30');
    await context.close();
});

test('إخفاء تذكرة من القائمة يطلب تأكيداً أولاً ويوضّح أنها تبقى لدى الدعم', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures(), { hash: '#tickets' });
    await page.click('.ticket-card[data-id="t1"]');
    await page.waitForSelector('#archiveTicket');
    await page.click('#archiveTicket');

    await page.waitForSelector('.ui-dialog');
    const dialogText = await page.textContent('.ui-dialog');
    assert.match(dialogText, /ستبقى محفوظة بالكامل لدى فريق الدعم/);

    // الإلغاء لا ينفّذ أي شيء
    await page.click('.ui-dialog button:has-text("تراجع")');
    await page.waitForSelector('.ui-dialog', { state: 'detached' });
    assert.equal(await page.locator('.ticket-card[data-id="t1"]').count(), 1);
    await context.close();
});

test('منع التذاكر المكررة (إعداد الأدمن) يحذّر قبل إنشاء تذكرة بنفس العنوان', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures(), { hash: '#tickets' });
    // زر قسم التذاكر تحديداً (زر "نظرة عامة" مخفي مع قسمه)
    await page.click('#openCreateTicket');
    await page.waitForSelector('#createTicketModal.active');
    await page.fill('#userTicketTitle', 'مشكلة في تسجيل الدخول');
    await page.fill('#userTicketDescription', 'نفس المشكلة السابقة تتكرر معي مرة أخرى اليوم');
    await page.click('#submitTicketBtn');

    await page.waitForSelector('.ui-dialog');
    assert.match(await page.textContent('.ui-dialog'), /لديك تذكرة مفتوحة بنفس العنوان/);
    await context.close();
});

test('التحقق من صحة نموذج الملف الشخصي يمنع الحفظ الخاطئ', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures(), { hash: '#profile' });
    await page.waitForSelector('#profileFullName');
    await page.fill('#profileFullName', 'ا');
    await page.click('#profileSaveBtn');
    await page.waitForSelector('#profileFullNameError:not(.u-hidden)');
    const calls = await page.evaluate(() => window.__CALLS__ || []);
    assert.equal(calls.filter(c => c[0] === 'updateProfile').length, 0);
    await context.close();
});

test('تغيير كلمة المرور يرفض القيم الضعيفة وغير المتطابقة', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures(), { hash: '#profile' });
    await page.waitForSelector('#newPassword');

    await page.fill('#newPassword', 'abc');
    await page.click('#passwordSaveBtn');
    await page.waitForSelector('#newPasswordError:not(.u-hidden)');

    await page.fill('#newPassword', 'Str0ngPass1');
    await page.fill('#confirmPassword', 'Different1');
    await page.click('#passwordSaveBtn');
    await page.waitForSelector('#confirmPasswordError:not(.u-hidden)');

    const calls = await page.evaluate(() => window.__CALLS__ || []);
    assert.equal(calls.filter(c => c[0] === 'updatePassword').length, 0);
    await context.close();
});

test('قسم الإشعارات يعرض إشعارات العميل ويصفّي غير المقروءة', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures(), { hash: '#notifications' });
    await page.waitForSelector('#notificationsList [data-notification-id]');
    assert.equal(await page.locator('#notificationsList [data-notification-id]').count(), 2);

    await page.selectOption('#notificationFilter', 'unread');
    await page.waitForFunction(() => document.querySelectorAll('#notificationsList [data-notification-id]').length === 1);
    await context.close();
});

test('التنقّل بين الأقسام يعمل من القائمة الجانبية ويحدّث العنوان', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures());
    await page.click('.sidebar-item[data-tab="badges"]');
    await page.waitForSelector('#badgesTabContent.active');
    assert.equal(new URL(page.url()).hash, '#badges');
    await page.waitForSelector('.badge-card.earned');
    assert.equal(await page.locator('.badge-card').count(), 2);
    assert.match(await page.textContent('#badgesProgressSummary'), /1 من 2/);
    await context.close();
});

test('حالة الفراغ تظهر بوضوح عندما لا توجد تذاكر', { skip: !chromiumPath }, async () => {
    const fx = fixtures();
    fx.tables.tickets = [];
    const { page, context } = await openDashboard(browser, baseUrl, fx, { hash: '#tickets' });
    await page.waitForSelector('#userTicketsList .state-block');
    assert.match(await page.textContent('#userTicketsList'), /لا توجد تذاكر حتى الآن/);
    await context.close();
});

test('التصميم متجاوب: لا تمرير أفقي على أي مقاس، والقائمة تتحوّل لدرج', { skip: !chromiumPath }, async () => {
    const { page, context } = await openDashboard(browser, baseUrl, fixtures());

    // القائمة ثابتة على الشاشات الكبيرة والمحتوى متزحزح جنبها
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('sidebar')).right), '0px');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.admin-main')).marginRight), '290px');

    // مسح كل المقاسات الشائعة: أي تمرير أفقي هنا يعني كسر في التخطيط
    for (const width of [320, 360, 390, 414, 480, 520, 600, 768, 992, 1024, 1100, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(120);
        const metrics = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            sidebarRight: getComputedStyle(document.getElementById('sidebar')).right
        }));
        assert.ok(metrics.overflow <= 1, `تمرير أفقي بمقدار ${metrics.overflow}px عند عرض ${width}px`);
        if (width < 1100) {
            assert.notEqual(metrics.sidebarRight, '0px', `القائمة يجب أن تكون درجًا عند ${width}px`);
        } else {
            assert.equal(metrics.sidebarRight, '0px', `القائمة يجب أن تكون ثابتة عند ${width}px`);
        }
    }
    await context.close();
});

test('لا تسرّب لأحداث التذكرة الداخلية إلى واجهة العميل', { skip: !chromiumPath }, async () => {
    const fx = fixtures();
    fx.tables.ticket_activity.push(
        { id: 'a3', ticket_id: 't1', action_type: 'internal_note', created_at: '2026-09-01T09:10:00Z' },
        { id: 'a4', ticket_id: 't1', action_type: 'assignee_change', created_at: '2026-09-01T09:11:00Z' }
    );
    const { page, context } = await openDashboard(browser, baseUrl, fx, { hash: '#tickets' });
    await page.click('.ticket-card[data-id="t1"]');
    await page.waitForSelector('.ticket-details-scroll .activity-timeline');
    const text = await page.textContent('.ticket-details-scroll');
    assert.ok(!text.includes('internal_note'), 'ملاحظة داخلية ظهرت للعميل');
    assert.ok(!text.includes('assignee_change'), 'تغيير المُسنَد إليه ظهر للعميل');
    await context.close();
});
