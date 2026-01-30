// customer-dashboard.js
import { requireAuth, logout, updateProfile, updatePassword } from './auth-client.js';
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
    if (welcomeEl) {
        welcomeEl.textContent = isGuest
            ? 'مرحباً بك (زائر)'
            : `مرحباً، ${user.profile?.full_name || user.email?.split('@')[0] || 'مستخدم'}`;
    }

    const userInitial = document.getElementById('userInitial');
    if (userInitial) {
        userInitial.textContent = (user.profile?.full_name || user.email || 'U')[0].toUpperCase();
    }

    /* ================= GUEST MODE ================= */

    if (isGuest) {
        const restrictedElements = [
            'openCreateTicket',
            'userCreateTicketForm',
            'newReportForm',
            'profileTab'
        ];

        restrictedElements.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            if (el.tagName === 'FORM' || el.tagName === 'BUTTON' || el.classList.contains('nav-tab')) {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    alert('هذه الميزة غير متاحة في وضع الضيف. يرجى إنشاء حساب.');
                }, true);

                if (el.tagName === 'BUTTON' || el.classList.contains('nav-tab')) {
                    el.style.opacity = '0.5';
                    el.style.pointerEvents = 'auto';
                }
            } else {
                el.style.display = 'none';
            }
        });

        const dashboardContainer = document.querySelector('.dashboard-container');
        if (dashboardContainer) {
            const guestAlert = document.createElement('div');
            guestAlert.style.cssText = `
                background: var(--hover-bg);
                color: var(--color-accent);
                padding: 1rem;
                border-radius: 0.5rem;
                margin-bottom: 1rem;
                border: 1px solid var(--color-accent);
                text-align: center;
                font-weight: 600;
            `;
            guestAlert.innerHTML =
                'أنت في وضع الضيف. يمكنك التصفح فقط. <a href="sign-up.html" style="text-decoration: underline;">أنشئ حساباً الآن</a>';
            dashboardContainer.prepend(guestAlert);
        }
    }

    /* ================= TABS LOGIC ================= */

    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (isGuest && tab.id === 'profileTab') return;

            const target = tab.getAttribute('data-tab');
            
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetContent = document.getElementById(target + 'TabContent') || document.getElementById(target);
            if (targetContent) targetContent.classList.add('active');
        });
    });

    /* ================= MODALS LOGIC ================= */

    const openModalBtns = document.querySelectorAll('[id^="open"]');
    openModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.id.replace('open', '').toLowerCase() + 'Modal';
            const modal = document.getElementById(modalId) || document.getElementById(btn.id.replace('open', 'user') + 'Modal');
            if (modal) modal.classList.add('active');
        });
    });

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
        // تعبئة البيانات الحالية
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
            'userOpenTickets': stats.open,
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
            el.innerHTML = `
                <div class="ticket-card-header">
                    <span class="ticket-number">#${t.ticket_number || '---'}</span>
                    <span class="ticket-status status-${t.status}">${statusLabels[t.status] || t.status}</span>
                </div>
                <div class="ticket-card-body">
                    <h3 class="ticket-title">${t.title}</h3>
                    <p class="ticket-description">${t.description.slice(0, 100)}${t.description.length > 100 ? '...' : ''}</p>
                </div>
                <div class="ticket-card-footer">
                    <span class="ticket-priority priority-${t.priority}">${priorityLabels[t.priority] || t.priority}</span>
                    <span class="ticket-date">${new Date(t.created_at).toLocaleDateString('ar-EG')}</span>
                </div>
                <button class="btn btn-outline view-ticket-btn" style="margin-top: 1rem; width: 100%;">عرض التفاصيل</button>
            `;
            
            el.querySelector('.view-ticket-btn').addEventListener('click', () => openTicketDetail(t));
            list.appendChild(el);
        });
    }

    async function openTicketDetail(ticket) {
        currentTicketId = ticket.id;
        const modal = document.getElementById('ticketDetailModal');
        if (!modal) return;

        document.getElementById('detailTicketTitle').textContent = ticket.title;
        document.getElementById('detailTicketNumber').textContent = `#${ticket.ticket_number}`;
        document.getElementById('detailTicketStatus').textContent = ticket.status;
        document.getElementById('detailTicketDescription').textContent = ticket.description;

        modal.classList.add('active');
        await loadReplies(ticket.id);
    }

    async function loadReplies(ticketId) {
        const list = document.getElementById('detailRepliesList');
        if (!list) return;

        const replies = await fetchTicketReplies(ticketId);
        list.innerHTML = replies.map(r => `
            <div class="reply-item ${r.profiles?.role === 'admin' ? 'reply-admin' : 'reply-user'}">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem;">
                    <strong>${r.profiles?.full_name || 'مستخدم'}</strong>
                    <span>${new Date(r.created_at).toLocaleString('ar-EG')}</span>
                </div>
                <div>${r.message}</div>
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

    /* ================= FILTERS ================= */

    const searchInput = document.getElementById('userTicketSearch');
    const statusFilter = document.getElementById('userStatusFilter');
    const priorityFilter = document.getElementById('userPriorityFilter');

    [searchInput, statusFilter, priorityFilter].forEach(el => {
        el?.addEventListener('input', () => {
            renderTickets({
                search: searchInput?.value,
                status: statusFilter?.value,
                priority: priorityFilter?.value
            });
        });
    });

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
