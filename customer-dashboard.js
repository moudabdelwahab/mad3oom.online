// customer-dashboard.js
import { requireAuth, logout, updateProfile, updatePassword } from './auth-client.js';
import { initCustomerSidebar } from './assets/js/customer-sidebar.js';
import {
    fetchUserTickets,
    createTicket,
    fetchTicketStats,
    fetchTicketReplies,
    addTicketReply,
    subscribeToTickets
} from './tickets-service.js';
import {
    fetchNotifications,
    markAllAsRead,
    subscribeToNotifications
} from './notifications-service.js';

(async function () {

    /* ================= AUTH ================= */

    const user = await requireAuth('customer');
    if (!user) {
        window.location.replace('sign-in.html');
        return;
    }

    const isGuest = user.isGuest || false;

    // تحديث واجهة المستخدم ببيانات المستخدم
    const welcomeEl = document.getElementById('welcomeUser');
    const updateWelcomeText = () => {
        if (welcomeEl) {
            welcomeEl.textContent = isGuest
                ? 'مرحباً بك (زائر)'
                : `مرحباً، ${user.profile?.full_name || user.email?.split('@')[0] || 'مستخدم'}`;
        }
    };
    updateWelcomeText();

    // Initialize Sidebar
    initCustomerSidebar((tabName) => {
        const tabEl = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
        if (tabEl) tabEl.click();
    });

    // Update Sidebar User Info
    const updateSidebarUserInfo = () => {
        const customerInitial = document.getElementById('customerInitial');
        if (customerInitial) {
            customerInitial.textContent = (user.profile?.full_name || user.email || 'U')[0].toUpperCase();
        }
        
        if (isGuest) {
            const profileSidebarItem = document.getElementById('profileSidebarItem');
            if (profileSidebarItem) {
                profileSidebarItem.style.opacity = '0.5';
                profileSidebarItem.style.pointerEvents = 'auto';
                profileSidebarItem.addEventListener('click', (e) => {
                    if (isGuest) {
                        e.preventDefault();
                        e.stopPropagation();
                        alert('هذه الميزة غير متاحة في وضع الضيف. يرجى إنشاء حساب.');
                    }
                }, true);
            }
        }
    };

    // Wait a bit for sidebar to load
    setTimeout(updateSidebarUserInfo, 500);

    /* ================= GUEST MODE ================= */

    if (isGuest) {
        const restrictedElements = [
            'openCreateTicket',
            'userCreateTicketForm',
            'profileTab'
        ];

        restrictedElements.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                alert('هذه الميزة غير متاحة في وضع الضيف. يرجى إنشاء حساب.');
            }, true);

            el.style.opacity = '0.5';
            el.style.pointerEvents = 'auto';
        });
    }

    /* ================= TABS LOGIC ================= */

    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (isGuest && tab.id === 'profileTab') {
                alert('هذه الميزة غير متاحة في وضع الضيف.');
                return;
            }

            const target = tab.getAttribute('data-tab');
            
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetContent = document.getElementById(target + 'TabContent');
            if (targetContent) targetContent.classList.add('active');
        });
    });

    /* ================= PROFILE MENU LOGIC ================= */

    const profileNavBtn = document.getElementById('profileNavBtn');
    const userAvatarMenu = document.getElementById('userAvatarMenu');

    if (profileNavBtn && userAvatarMenu) {
        profileNavBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userAvatarMenu.style.display = userAvatarMenu.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', () => {
            userAvatarMenu.style.display = 'none';
        });

        userAvatarMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.target.getAttribute('data-tab')) {
                const tabName = e.target.getAttribute('data-tab');
                const tabEl = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
                if (tabEl) tabEl.click();
                userAvatarMenu.style.display = 'none';
            }
        });
    }

    /* ================= MODALS LOGIC ================= */

    const openCreateTicketBtn = document.getElementById('openCreateTicket');
    const createTicketModal = document.getElementById('createTicketModal');
    
    if (openCreateTicketBtn && createTicketModal) {
        openCreateTicketBtn.addEventListener('click', () => {
            if (isGuest) return;
            createTicketModal.classList.add('active');
        });
    }

    const closeModalBtns = document.querySelectorAll('.close-modal, .modal');
    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target === btn || btn.classList.contains('close-modal')) {
                const modal = btn.closest('.modal');
                if (modal) modal.classList.remove('active');
            }
        });
    });

    /* ================= LOGOUT ================= */

    const signOutLink = document.getElementById('signOutLink');
    if (signOutLink) {
        signOutLink.addEventListener('click', async (e) => {
            e.preventDefault();
            await logout();
            window.location.replace('sign-in.html');
        });
    }

    /* ================= PROFILE FORM ================= */

    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        const fullNameInput = document.getElementById('profileFullName');
        const phoneInput = document.getElementById('profilePhone');
        if (fullNameInput) fullNameInput.value = user.profile?.full_name || '';
        if (phoneInput) phoneInput.value = user.profile?.phone || '';

        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const updates = {
                full_name: fullNameInput?.value,
                phone: phoneInput?.value
            };
            const { error } = await updateProfile(updates);
            if (error) alert('خطأ في التحديث: ' + error.message);
            else alert('تم تحديث الملف الشخصي بنجاح');
        });
    }

    const passwordForm = document.getElementById('changePasswordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPass = document.getElementById('newPassword')?.value;
            const confirmPass = document.getElementById('confirmPassword')?.value;

            if (newPass !== confirmPass) {
                alert('كلمات المرور غير متطابقة');
                return;
            }

            const { error } = await updatePassword(newPass);
            if (error) alert('خطأ: ' + error.message);
            else {
                alert('تم تغيير كلمة المرور بنجاح');
                passwordForm.reset();
            }
        });
    }

    /* ================= NOTIFICATIONS ================= */

    const notificationBtn = document.getElementById('notificationBtn');
    const notificationDropdown = document.getElementById('notificationDropdown');
    if (notificationBtn && notificationDropdown) {
        notificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            notificationDropdown.style.display = notificationDropdown.style.display === 'none' ? 'block' : 'none';
        });

        document.addEventListener('click', () => {
            notificationDropdown.style.display = 'none';
        });

        notificationDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    const clearNotificationsBtn = document.getElementById('clearNotifications');
    if (clearNotificationsBtn) {
        clearNotificationsBtn.addEventListener('click', async () => {
            await markAllAsRead();
            renderNotifications();
        });
    }

    async function renderNotifications() {
        const list = document.getElementById('notificationsList');
        const badge = document.getElementById('notificationBadge');
        if (!list) return;

        const notifications = await fetchNotifications();
        const unreadCount = notifications.filter(n => !n.is_read).length;

        if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }

        if (notifications.length === 0) {
            list.innerHTML = '<p style="padding: 1rem; text-align: center; font-size: 0.9rem; color: var(--color-text-secondary);">لا توجد إشعارات</p>';
            return;
        }

        list.innerHTML = notifications.map(n => `
            <div class="notification-item ${n.is_read ? '' : 'unread'}" style="padding: 0.75rem; border-bottom: 1px solid var(--color-border); cursor: pointer; ${n.is_read ? '' : 'background: var(--hover-bg);'}">
                <div style="font-weight: 600; font-size: 0.9rem;">${n.title}</div>
                <div style="font-size: 0.8rem; color: var(--color-text-secondary);">${n.message}</div>
                <div style="font-size: 0.7rem; color: var(--color-text-muted); margin-top: 0.25rem;">${new Date(n.created_at).toLocaleString('ar-EG')}</div>
            </div>
        `).join('');
    }

    /* ================= TICKETS ================= */

    let currentTicketId = null;

    async function renderStats() {
        const stats = await fetchTicketStats();
        const elements = {
            'userTotalTickets': stats.total,
            'userInProgressTickets': stats.inProgress,
            'userResolvedTickets': stats.resolved
        };

        for (const [id, val] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val ?? 0;
        }
    }

    async function renderTickets(filters = {}) {
        const list = document.getElementById('userTicketsList');
        if (!list) return;

        const tickets = await fetchUserTickets(filters);
        
        if (!tickets.length) {
            list.innerHTML = `<p class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 2rem;">لا توجد تذاكر حتى الآن</p>`;
            return;
        }

        const statusLabels = { open: 'مفتوحة', 'in-progress': 'قيد المعالجة', resolved: 'تم الحل', closed: 'مغلقة' };
        const priorityLabels = { low: 'منخفضة', medium: 'متوسطة', high: 'عالية' };

        list.innerHTML = '';
        tickets.forEach(t => {
            const el = document.createElement('div');
            el.className = 'ticket-card';
            el.style.cssText = 'background: var(--color-surface); padding: 1.5rem; border-radius: 1rem; border: 1px solid var(--color-border); cursor: pointer;';
            el.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                    <span style="color: var(--color-text-secondary); font-size: 0.85rem;">#${t.ticket_number || '---'}</span>
                    <span style="padding: 0.2rem 0.6rem; border-radius: 1rem; font-size: 0.75rem; background: var(--color-muted);">${statusLabels[t.status] || t.status}</span>
                </div>
                <h3 style="margin-bottom: 0.5rem;">${t.title}</h3>
                <p style="color: var(--color-text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">${t.description.slice(0, 80)}${t.description.length > 80 ? '...' : ''}</p>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.8rem; color: var(--color-accent); font-weight: 600;">${priorityLabels[t.priority] || t.priority}</span>
                    <span style="font-size: 0.8rem; color: var(--color-text-muted);">${new Date(t.created_at).toLocaleDateString('ar-EG')}</span>
                </div>
            `;
            
            el.addEventListener('click', () => openTicketDetail(t));
            list.appendChild(el);
        });
    }

    async function openTicketDetail(ticket) {
        currentTicketId = ticket.id;
        const modal = document.getElementById('ticketDetailModal');
        if (!modal) return;

        document.getElementById('detailTicketTitle').textContent = ticket.title;
        document.getElementById('detailTicketNumber').textContent = `#${ticket.ticket_number}`;
        
        const statusEl = document.getElementById('detailTicketStatus');
        statusEl.textContent = ticket.status;
        statusEl.style.background = 'var(--color-muted)';
        
        document.getElementById('detailTicketDescription').textContent = ticket.description;

        modal.classList.add('active');
        await loadReplies(ticket.id);
    }

    async function loadReplies(ticketId) {
        const list = document.getElementById('detailRepliesList');
        if (!list) return;

        const replies = await fetchTicketReplies(ticketId);
        if (replies.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">لا توجد ردود بعد</p>';
            return;
        }

        list.innerHTML = replies.map(r => `
            <div class="reply-item ${r.profiles?.role === 'admin' ? 'reply-admin' : 'reply-user'}" style="margin-bottom: 1rem; padding: 0.75rem; border-radius: 0.5rem; background: var(--color-surface);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem;">
                    <strong>${r.profiles?.full_name || 'مستخدم'}</strong>
                    <span style="color: var(--color-text-muted);">${new Date(r.created_at).toLocaleString('ar-EG')}</span>
                </div>
                <div style="font-size: 0.9rem;">${r.message}</div>
            </div>
        `).join('');
        list.scrollTop = list.scrollHeight;
    }

    const replyForm = document.getElementById('detailReplyForm');
    if (replyForm) {
        replyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msgInput = document.getElementById('detailReplyMessage');
            const message = msgInput?.value.trim();
            if (!message || !currentTicketId) return;

            try {
                await addTicketReply(currentTicketId, message);
                msgInput.value = '';
                await loadReplies(currentTicketId);
            } catch (err) {
                alert('فشل إرسال الرد: ' + err.message);
            }
        });
    }

    const createTicketForm = document.getElementById('userCreateTicketForm');
    if (createTicketForm) {
        createTicketForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('userTicketTitle')?.value;
            const description = document.getElementById('userTicketDescription')?.value;
            const priority = document.getElementById('userTicketPriority')?.value;

            try {
                await createTicket({ title, description, priority });
                createTicketForm.reset();
                document.getElementById('createTicketModal')?.classList.remove('active');
                await renderStats();
                await renderTickets();
            } catch (err) {
                alert('خطأ في إنشاء التذكرة: ' + err.message);
            }
        });
    }

    /* ================= INIT ================= */

    await renderStats();
    await renderTickets();
    await renderNotifications();

    // اشتراكات لحظية
    if (!isGuest) {
        subscribeToTickets(() => {
            renderStats();
            renderTickets();
            if (currentTicketId) loadReplies(currentTicketId);
        });
        subscribeToNotifications(user.id, () => {
            renderNotifications();
        });
    }

})();
