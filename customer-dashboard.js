// customer-dashboard.js
import { requireAuth, logout } from './auth-client.js';
import {
    fetchUserTickets,
    createTicket,
    fetchTicketStats
} from './tickets-service.js';

(async function () {

    /* ================= AUTH ================= */

    const session = await requireAuth('user');
    if (!session) return;

    const welcomeEl = document.getElementById('welcomeUser');
    if (welcomeEl) {
        welcomeEl.textContent = `مرحباً، ${session.profile.email}`;
    }

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

/* ================= STATS ================= */

async function renderStats() {
    const stats = await fetchTicketStats();

    userTotalTickets.textContent = stats.total;
    userOpenTickets.textContent = stats.open;
    userInProgressTickets.textContent = stats.inProgress;
    userResolvedTickets.textContent = stats.resolved;
}

/* ================= TICKETS ================= */

async function renderTickets(filters = {}) {
    const list = document.getElementById('userTicketsList');
    list.innerHTML = '';

    const tickets = await fetchUserTickets(filters);

    if (!tickets.length) {
        list.innerHTML = `<p class="empty-state">لا توجد تذاكر حتى الآن</p>`;
        return;
    }

    tickets.forEach(t => {
        const el = document.createElement('div');
        el.className = 'ticket-item';
        el.innerHTML = `
            <div class="ticket-title">${t.title}</div>
            <div class="ticket-description">${t.description}</div>
            <small>الحالة: ${t.status} | الأولوية: ${t.priority}</small>
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

/* ================= CREATE ================= */

function bindCreateTicket() {
    const form = document.getElementById('userCreateTicketForm');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();

        await createTicket({
            title: userTicketTitle.value,
            description: userTicketDescription.value,
            priority: userTicketPriority.value
        });

        form.reset();
        await renderStats();
        await renderTickets();
    });
}
const session = await requireAuth('user');
