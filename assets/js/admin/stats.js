import { supabase } from '../../api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';
import { fetchTicketStats } from '../../tickets-service.js';

let user = null;

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return;

    updateAdminUI(user);
    renderStats();
}

async function renderStats() {
    const stats = await fetchTicketStats();
    
    const totalEl = document.getElementById('totalTickets');
    const openEl = document.getElementById('openTickets');
    const resolvedEl = document.getElementById('resolvedTickets');

    if (totalEl) totalEl.textContent = stats.total;
    if (openEl) openEl.textContent = stats.open;
    if (resolvedEl) resolvedEl.textContent = stats.resolved;

    // Additional stats could be fetched here
    const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const usersEl = document.getElementById('totalUsers');
    if (usersEl) usersEl.textContent = usersCount || 0;
}

init();
