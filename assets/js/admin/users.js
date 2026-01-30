import { supabase } from '../../api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';

let user = null;

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return;

    updateAdminUI(user);
    renderUsers();
}

async function renderUsers() {
    const body = document.getElementById('usersBody');
    if (!body) return;

    const { data: users } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    body.innerHTML = users?.map(u => `
        <tr>
            <td>${u.full_name || 'بدون اسم'}</td>
            <td>${u.email}</td>
            <td><span class="status-badge status-${u.role}">${u.role}</span></td>
            <td>${new Date(u.created_at).toLocaleDateString('ar-EG')}</td>
            <td>
                <button class="btn btn-secondary btn-sm edit-user-btn" data-user-id="${u.id}">تعديل</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5">لا يوجد مستخدمين</td></tr>';
}

init();
