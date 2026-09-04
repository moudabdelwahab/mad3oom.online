/**
 * customer-sidebar.js — شريط التنقّل المشترك لكل صفحات العميل.
 *
 * الملف ده مستخدم من: customer-dashboard, customer-subscriptions,
 * customer-security-settings, knowledge-base, community, forum, roadmap.
 * علشان كده التوقيع بيقبل الشكلين:
 *   initCustomerSidebar(fn)                     ← الشكل القديم (لسه شغال)
 *   initCustomerSidebar({ onTabChange, onReady })← الشكل الجديد
 *
 * لو الصفحة مش لوحة العميل (يعني مفيش onTabChange)، الضغط على عنصر له
 * data-tab بينقل لـ customer-dashboard.html#<tab> بدل ما ميعملش حاجة —
 * ده كان بق قديم: القائمة نفسها بتظهر في كل الصفحات لكن عناصرها ميتة
 * في أي صفحة غير اللوحة.
 */

const DASHBOARD_PATH = '/customer-dashboard.html';

let tabChangeHandler = null;

export function initCustomerSidebar(optionsOrCallback) {
    const options = typeof optionsOrCallback === 'function'
        ? { onTabChange: optionsOrCallback }
        : (optionsOrCallback || {});

    tabChangeHandler = options.onTabChange || null;

    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    fetch('/assets/components/customer-sidebar.html')
        .then(response => response.text())
        .then(html => {
            sidebarContainer.innerHTML = html;
            setupSidebarLogic(tabChangeHandler);
            syncNavHeight();
            if (typeof options.onReady === 'function') options.onReady();
        })
        .catch(err => console.error('Error loading customer sidebar:', err));
}

/**
 * يعرض عدّاداً بجوار عنصر في القائمة (تذاكر مفتوحة، إشعارات غير مقروءة…).
 * تمرير 0 أو قيمة غير صالحة يخفي العدّاد.
 */
export function setSidebarBadge(tabName, count) {
    const item = document.querySelector(`.sidebar-item[data-tab="${tabName}"]`);
    if (!item) return;

    let badge = item.querySelector('.nav-count');
    const value = Number(count) || 0;

    if (value <= 0) {
        badge?.remove();
        return;
    }
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-count';
        item.appendChild(badge);
    }
    badge.textContent = value > 99 ? '99+' : String(value);
}

/** يحدّد العنصر النشط في القائمة (يُستدعى عند تبديل القسم من أي مكان). */
export function setActiveSidebarTab(tabName) {
    document.querySelectorAll('.sidebar-item[data-tab]').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-tab') === tabName);
    });
}

/**
 * ارتفاع شريط التنقّل العلوي يتغيّر حسب حجم الشاشة، والقائمة الثابتة على
 * الشاشات الكبيرة لازم تبدأ من تحته بالظبط. بنقيسه فعلياً بدل ما نفترضه.
 */
function syncNavHeight() {
    const nav = document.querySelector('.admin-nav');
    if (!nav) return;

    const apply = () => {
        const height = Math.round(nav.getBoundingClientRect().height);
        if (height > 0) {
            document.documentElement.style.setProperty('--customer-nav-h', `${height}px`);
        }
    };

    apply();
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(apply).observe(nav);
    } else {
        window.addEventListener('resize', apply);
    }
}

function setupSidebarLogic(onTabChange) {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const customerAvatarBtn = document.getElementById('customerAvatarBtn');
    const customerAvatarMenu = document.getElementById('customerAvatarMenu');
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationMenu = document.getElementById('notificationMenu');
    const sidebarItems = document.querySelectorAll('.sidebar-item[data-tab]');

    if (!menuToggle || !sidebar) return;

    // ── الإشعارات ────────────────────────────────────────────────────────────
    if (notificationBtn && notificationMenu) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = notificationMenu.style.display === 'block';
            notificationMenu.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) loadNotifications();
        });

        document.getElementById('markAllReadBtn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const { markAllAsRead } = await import('/notifications-service.js');
            await markAllAsRead();
            loadNotifications();
        });
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function loadNotifications() {
        const list = document.getElementById('notificationList');
        const badge = document.getElementById('notificationBadge');
        if (!list) return;

        try {
            const { fetchNotifications, markAsRead } = await import('/notifications-service.js');
            const notifications = await fetchNotifications();

            const unreadCount = notifications.filter(n => !n.is_read).length;
            if (badge) {
                badge.textContent = unreadCount;
                badge.style.display = unreadCount > 0 ? 'flex' : 'none';
            }
            setSidebarBadge('notifications', unreadCount);

            if (notifications.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-text-secondary); font-size: 0.85rem;">لا توجد إشعارات</div>';
                return;
            }

            list.innerHTML = notifications.map(n => `
                <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${escapeHtml(n.id)}" style="padding: 12px 16px; border-bottom: 1px solid var(--color-border); cursor: pointer; transition: background 0.2s; ${n.is_read ? '' : 'background: rgba(0, 119, 204, 0.05);'}">
                    <div style="font-weight: 700; font-size: 0.85rem; margin-bottom: 4px; color: var(--color-text);">${escapeHtml(n.title)}</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-secondary); line-height: 1.4;">${escapeHtml(n.message)}</div>
                    <div style="font-size: 0.7rem; color: #999; margin-top: 6px;">${escapeHtml(new Date(n.created_at).toLocaleString('ar-EG'))}</div>
                </div>
            `).join('');

            list.querySelectorAll('.notification-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const id = item.dataset.id;
                    await markAsRead(id);
                    const notification = notifications.find(n => String(n.id) === String(id));
                    if (notification && notification.link) {
                        window.location.href = notification.link;
                    } else {
                        loadNotifications();
                    }
                });
            });
        } catch (err) {
            console.error('[CustomerSidebar] Error loading notifications:', err);
            list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-danger); font-size: 0.85rem;">فشل تحميل الإشعارات</div>';
        }
    }

    // ── الاشتراك اللحظي في الإشعارات ─────────────────────────────────────────
    let notificationSubscription = null;
    async function setupNotificationRealtime() {
        try {
            const { subscribeToNotifications } = await import('/notifications-service.js');
            const { supabase } = await import('/api-config.js');
            const { data: { user } } = await supabase.auth.getUser();

            if (user && !notificationSubscription) {
                notificationSubscription = subscribeToNotifications(user.id, (newNotification) => {
                    loadNotifications();
                    if ('Notification' in window && Notification.permission === 'granted') {
                        new Notification(newNotification.title, {
                            body: newNotification.message,
                            icon: '/assets/images/logo.png'
                        });
                    }
                });
            }
        } catch (err) {
            console.error('[CustomerSidebar] Error setting up realtime notifications:', err);
        }
    }

    loadNotifications();
    setupNotificationRealtime();
    checkWhatsAppPermission();

    // ── فتح/غلق الدرج ────────────────────────────────────────────────────────
    const toggleSidebar = () => {
        sidebar.classList.toggle('active');
        sidebarOverlay.classList.toggle('active');
    };

    const menuToggles = [menuToggle, document.getElementById('mobileMenuToggle')].filter(Boolean);
    menuToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
    });

    if (sidebarClose) sidebarClose.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

    // ── التنقّل بين الأقسام ──────────────────────────────────────────────────
    sidebarItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = item.getAttribute('data-tab');

            // خارج لوحة العميل: ننقل للوحة مع تحديد القسم المطلوب
            if (!onTabChange) {
                window.location.href = `${DASHBOARD_PATH}#${tabName}`;
                return;
            }

            setActiveSidebarTab(tabName);
            onTabChange(tabName);

            // على الشاشات الصغيرة الدرج بيتقفل بعد الاختيار
            if (sidebar.classList.contains('active')) toggleSidebar();
        });
    });

    // ── اللغة ────────────────────────────────────────────────────────────────
    const languageToggleBtn = document.getElementById('languageToggleBtn');
    const languageMenu = document.getElementById('languageMenu');
    const langArabic = document.getElementById('langArabic');
    const langEnglish = document.getElementById('langEnglish');

    if (languageToggleBtn && languageMenu) {
        languageToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = languageMenu.style.display === 'block';
            languageMenu.style.display = isVisible ? 'none' : 'block';
            updateLanguageCheckmarks();
        });

        langArabic?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            changeLanguage('ar');
            languageMenu.style.display = 'none';
        });

        langEnglish?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            changeLanguage('en');
            languageMenu.style.display = 'none';
        });
    }

    function updateLanguageCheckmarks() {
        const currentLang = localStorage.getItem('mad3oom-language') || 'ar';
        const arabicCheck = langArabic?.querySelector('.lang-check');
        const englishCheck = langEnglish?.querySelector('.lang-check');

        if (arabicCheck) arabicCheck.style.display = currentLang === 'ar' ? 'inline' : 'none';
        if (englishCheck) englishCheck.style.display = currentLang === 'en' ? 'inline' : 'none';
    }

    function changeLanguage(lang) {
        if (window.languageManager) {
            window.languageManager.setLanguage(lang);
        } else {
            localStorage.setItem('mad3oom-language', lang);
            const html = document.documentElement;
            html.lang = lang;
            html.dir = lang === 'ar' ? 'rtl' : 'ltr';
            document.body.style.direction = lang === 'ar' ? 'rtl' : 'ltr';
        }
        window.location.reload();
    }

    // ── قائمة الحساب ─────────────────────────────────────────────────────────
    if (customerAvatarBtn && customerAvatarMenu) {
        customerAvatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = customerAvatarMenu.style.display === 'block';
            customerAvatarMenu.style.display = isVisible ? 'none' : 'block';
        });

        // معالج مسمّى حتى لا تتراكم النسخ عند إعادة تهيئة القائمة
        const closeAllMenus = () => {
            customerAvatarMenu.style.display = 'none';
            if (notificationMenu) notificationMenu.style.display = 'none';
            if (languageMenu) languageMenu.style.display = 'none';
        };
        document.removeEventListener('click', document._sidebarCloseMenus);
        document._sidebarCloseMenus = closeAllMenus;
        document.addEventListener('click', closeAllMenus);
    }

    const customerProfile = document.getElementById('customerProfile');
    const customerAccountSettings = document.getElementById('customerAccountSettings');
    const customerSecuritySettings = document.getElementById('customerSecuritySettings');
    const customerHelpSupport = document.getElementById('customerHelpSupport');

    if (customerProfile) {
        customerProfile.addEventListener('click', (e) => {
            e.preventDefault();
            customerAvatarMenu.style.display = 'none';
            if (onTabChange) {
                setActiveSidebarTab('profile');
                onTabChange('profile');
            } else {
                window.location.href = `${DASHBOARD_PATH}#profile`;
            }
        });
    }

    if (customerAccountSettings) {
        customerAccountSettings.addEventListener('click', (e) => {
            e.preventDefault();
            customerAvatarMenu.style.display = 'none';
            if (window.openSettingsModal) {
                window.openSettingsModal();
            } else {
                window.location.href = `${DASHBOARD_PATH}#profile`;
            }
        });
    }

    if (customerSecuritySettings) {
        customerSecuritySettings.addEventListener('click', (e) => {
            e.preventDefault();
            customerAvatarMenu.style.display = 'none';
            window.location.href = '/customer-security-settings.html';
        });
    }

    if (customerHelpSupport) {
        customerHelpSupport.addEventListener('click', (e) => {
            e.preventDefault();
            customerAvatarMenu.style.display = 'none';
            window.location.href = '/knowledge-base.html';
        });
    }

    // ── تسجيل الخروج ─────────────────────────────────────────────────────────
    const customerSignOut = document.getElementById('customerSignOut');
    const sidebarSignOut = document.getElementById('sidebarSignOut');

    const onLogout = async (e) => {
        e.preventDefault();
        try {
            const { logout } = await import('../auth-client.js');
            await logout();
            window.location.replace('login.html');
        } catch (err) {
            console.error('Logout failed:', err);
            localStorage.removeItem('mad3oom-guest-session');
            window.location.replace('login.html');
        }
    };

    if (customerSignOut) customerSignOut.addEventListener('click', onLogout);
    if (sidebarSignOut) sidebarSignOut.addEventListener('click', onLogout);

    updateLanguageCheckmarks();
}

async function checkWhatsAppPermission() {
    try {
        const { initSubscriptionHandler } = await import('/assets/js/sidebar-subscription-handler.js');
        await initSubscriptionHandler();
    } catch (err) {
        console.error('[CustomerSidebar] Error checking WhatsApp permission:', err);
    }
}
