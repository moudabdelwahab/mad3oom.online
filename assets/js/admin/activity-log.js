import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';

let user = null;

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return;

    updateAdminUI(user);
    renderActivityLog();
}

async function renderActivityLog() {
    const body = document.getElementById('activityBody');
    if (!body) return;

    const { data: activities } = await supabase
        .from('activity_log')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(50);

    body.innerHTML = activities?.map(a => `
        <tr>
            <td>
                <div style="font-weight: 600;">${a.profiles?.full_name || a.user_id}</div>
                <div style="font-size: 0.8rem; color: var(--color-text-secondary);">${a.profiles?.email || ''}</div>
            </td>
            <td><span class="status-badge status-pending">${a.action}</span></td>
            <td><pre style="font-size: 0.75rem; margin: 0; white-space: pre-wrap; word-break: break-all;">${JSON.stringify(a.details)}</pre></td>
            <td>${new Date(a.created_at).toLocaleString('ar-EG')}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align: center; padding: 2rem;">لا توجد سجلات نشاط</td></tr>';
}

init();
