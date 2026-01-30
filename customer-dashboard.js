// customer-dashboard.js
import { requireAuth, logout } from './auth-client.js';
import {
    fetchUserTickets,
    createTicket,
    fetchTicketStats
} from './tickets-service.js';

(async function () {

    /* ================= AUTH ================= */

    const session = await requireAuth('customer');
    if (!session) return;

    const isGuest = session.isGuest || false;

    const welcomeEl = document.getElementById('welcomeUser');
    if (welcomeEl) {
        welcomeEl.textContent = isGuest
            ? 'مرحباً بك (زائر)'
            : `مرحباً، ${session.profile?.email || 'مستخدم'}`;
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

            if (el.tagName === 'FORM' || el.tagName === 'BUTTON') {
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    alert('هذه الميزة غير متاحة في وضع الضيف. يرجى إنشاء حساب.');
                }, true);

                if (el.tagName === 'BUTTON') {
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

    /* ================= LOGOUT ================= */

    const signOutLink = document.getElementById('signOutLink');
    if (signOutLink) {
        signOutLink.addEventListener('click', async (e) => {
            e.preventDefault();
            await logout();
            window.location.replace('sign-in.html');
        });
    }

    /* ================= INIT ================= */

    await renderStats();
    await renderTickets();
    bindFilters();
    bindCreateTicket();

})();

/* ================= DOM CACHE ================= */

const userTotalTickets = document.getElementById('userTotalTickets');
const userOpenTickets = document.getElementById('userOpenTickets');
const userInProgressTickets = document.getElementById('userInProgressTickets');
const userResolvedTickets = document.getElementById('userResolvedTickets');

const userTicketSearch = document.getElementById('userTicketSearch');
const userStatusFilter = document.getElementById('userStatusFilter');
const userPriorityFilter = document.getElementById('userPriorityFilter');

const userTicketTitle = document.getElementById('userTicketTitle');
const userTicketDescription = document.getElementById('userTicketDescription');
const userTicketPriority = document.getElementById('userTicketPriority');

/* ================= STATS ================= */

async function renderStats() {
    if (!userTotalTickets) return;

    const stats = await fetchTicketStats();

    userTotalTickets.textContent = stats.total ?? 0;
    userOpenTickets && (userOpenTickets.textContent = stats.open ?? 0);
    userInProgressTickets && (userInProgressTickets.textContent = stats.inProgress ?? 0);
    userResolvedTickets && (userResolvedTickets.textContent = stats.resolved ?? 0);
}

/* ================= TICKETS ================= */

async function renderTickets(filters = {}) {
    const list = document.getElementById('userTicketsList');
    if (!list) return;

    list.innerHTML = '';

    const tickets = await fetchUserTickets(filters);

    if (!tickets.length) {
        list.innerHTML = `<p class="empty-state">لا توجد تذاكر حتى الآن</p>`;
        return;
    }

    const statusLabels = {
        open: 'مفتوحة',
        'in-progress': 'قيد المعالجة',
        resolved: 'تم الحل',
        closed: 'مغلقة'
    };

    const priorityLabels = {
        low: 'منخفضة',
        medium: 'متوسطة',
        high: 'عالية'
    };

    tickets.forEach(t => {
        const el = document.createElement('div');
        el.className = 'ticket-card';

        const userName =
            t.profiles?.full_name ||
            t.profiles?.email?.split('@')[0] ||
            'مستخدم';

        el.innerHTML = `
            <div class="ticket-card-header">
                <span class="ticket-number">#${t.ticket_number || '---'}</span>
                <span class="ticket-status status-${t.status}">
                    ${statusLabels[t.status] || t.status}
                </span>
            </div>
            <div class="ticket-card-body">
                <h3 class="ticket-title">${t.title}</h3>
                <p class="ticket-user">بواسطة: <strong>${userName}</strong></p>
                <p class="ticket-description">
                    ${t.description.slice(0, 100)}${t.description.length > 100 ? '...' : ''}
                </p>
            </div>
            <div class="ticket-card-footer">
                <span class="ticket-priority priority-${t.priority}">
                    ${priorityLabels[t.priority] || t.priority}
                </span>
                <span class="ticket-date">
                    ${new Date(t.created_at).toLocaleDateString('ar-EG')}
                </span>
            </div>
        `;

        list.appendChild(el);
    });
}

/* ================= FILTERS ================= */

function bindFilters() {
    userTicketSearch?.addEventListener('input', e =>
        renderTickets({ search: e.target.value })
    );

    userStatusFilter?.addEventListener('change', e =>
        renderTickets({ status: e.target.value })
    );

    userPriorityFilter?.addEventListener('change', e =>
        renderTickets({ priority: e.target.value })
    );
}

/* ================= CREATE TICKET ================= */

function bindCreateTicket() {
    const form = document.getElementById('userCreateTicketForm');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();

        await createTicket({
            title: userTicketTitle?.value || '',
            description: userTicketDescription?.value || '',
            priority: userTicketPriority?.value || 'medium'
        });

        form.reset();
        await renderStats();
        await renderTickets();
    });
}
