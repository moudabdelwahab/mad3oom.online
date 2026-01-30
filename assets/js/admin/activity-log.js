import { supabase } from '../../api-config.js';
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
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    body.innerHTML = activities?.map(a => `
        <tr>
            <td>${a.user_id}</td>
            <td>${a.action}</td>
            <td><pre style="font-size: 0.75rem; margin: 0;">${JSON.stringify(a.details)}</pre></td>
            <td>${new Date(a.created_at).toLocaleString('ar-EG')}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align: center; padding: 2rem;">لا توجد سجلات نشاط</td></tr>';
}

init();
