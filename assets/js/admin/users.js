import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';
import { adminImpersonateUser } from '/auth-client.js';

let user = null;

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return;

    updateAdminUI(user);
    renderUsers();
    
    // تفعيل التحديث اللحظي لجدول المستخدمين
    supabase
        .channel('public:profiles')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
            console.log('Profiles updated, re-rendering...');
            renderUsers();
        })
        .subscribe();
}

async function renderUsers() {
    const body = document.getElementById('usersBody');
    if (!body) return;

    const { data: users } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    // Fetch wallet status for freezing info
    const { data: wallets } = await supabase.from('user_wallets').select('user_id, is_frozen');
    const walletMap = new Map(wallets?.map(w => [w.user_id, w.is_frozen]) || []);

    body.innerHTML = users?.map(u => {
        const isFrozen = walletMap.get(u.id) || false;
        const isSupport = user?.email === 'support@mad3oom.online';
        
        return `
        <tr>
            <td>${u.full_name || 'بدون اسم'}</td>
            <td>${u.email}</td>
            <td><span class="status-badge status-${u.role}">${u.role === 'admin' ? 'مدير' : 'مستخدم'}</span></td>
            <td>${new Date(u.created_at).toLocaleDateString('ar-EG')}</td>
            <td>
                <div style="display: flex; gap: 5px;">
                    <button class="btn btn-primary btn-sm impersonate-btn" data-user-id="${u.id}">عرض</button>
                    <button class="btn btn-danger btn-sm ban-btn" data-user-id="${u.id}" ${u.status === 'banned' ? 'disabled' : ''}>${u.status === 'banned' ? 'محظور' : 'حظر'}</button>
                    <button class="btn btn-warning btn-sm points-btn" data-user-id="${u.id}" data-user-name="${u.full_name || u.email}">النقاط</button>
                    ${isSupport ? `<button class="btn btn-sm freeze-btn ${isFrozen ? 'btn-info' : 'btn-secondary'}" data-user-id="${u.id}" data-user-email="${u.email}" data-frozen="${isFrozen}">${isFrozen ? 'إلغاء التجميد' : 'تجميد'}</button>` : ''}
                </div>
            </td>
        </tr>
    `}).join('') || '<tr><td colspan="5">لا يوجد مستخدمين</td></tr>';

    // ربط أزرار العرض
    document.querySelectorAll('.impersonate-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-user-id');
            await impersonateUser(userId);
        });
    });

    // ربط أزرار الحظر
    document.querySelectorAll('.ban-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-user-id');
            if (confirm('هل أنت متأكد من حظر هذا المستخدم؟')) {
                const { error } = await supabase.from('profiles').update({ status: 'banned' }).eq('id', userId);
                if (error) alert('خطأ في الحظر: ' + error.message);
                else renderUsers();
            }
        });
    });

    // ربط أزرار النقاط
    document.querySelectorAll('.points-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-user-id');
            const userName = btn.getAttribute('data-user-name');
            const newPoints = prompt(`إدخال النقاط الجديدة للمستخدم: ${userName}`);
            if (newPoints !== null) {
                const points = parseInt(newPoints);
                if (isNaN(points)) {
                    alert('يرجى إدخال رقم صحيح');
                    return;
                }
                
                const { error } = await supabase.from('profiles').update({ points: points }).eq('id', userId);
                if (error) alert('خطأ في تحديث النقاط: ' + error.message);
                else {
                    // تحديث المحفظة أيضاً لضمان التزامن
                    await supabase.from('user_wallets').update({ total_points: points, available_points: points }).eq('user_id', userId);
                    alert('تم تحديث النقاط بنجاح');
                    renderUsers();
                }
            }
        });
    });

    // ربط أزرار التجميد
    document.querySelectorAll('.freeze-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const userId = btn.getAttribute('data-user-id');
            const userEmail = btn.getAttribute('data-user-email');
            const isFrozen = btn.getAttribute('data-frozen') === 'true';
            const action = isFrozen ? 'unfreeze' : 'freeze';
            const actionLabel = isFrozen ? 'إلغاء تجميد' : 'تجميد';

            if (confirm(`هل أنت متأكد من ${actionLabel} رصيد هذا المستخدم؟`)) {
                const { data, error } = await supabase.rpc('manage_user_points', {
                    target_user_email: userEmail,
                    amount_change: 0,
                    action_type: action
                });

                if (error) alert('خطأ: ' + error.message);
                else {
                    alert(data.message);
                    renderUsers();
                }
            }
        });
    });
}

async function impersonateUser(id) { 
    const { data: targetUser } = await supabase.from('profiles').select('email').eq('id', id).single();
    const activityModule = await import('/activity-service.js');
    activityModule.logActivity('impersonate', { target_user_id: id, target_email: targetUser?.email });
    await adminImpersonateUser(id);
    location.href = '/customer-dashboard.html';
}

init();
