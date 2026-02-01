import { supabase } from '../../api-config.js';

document.addEventListener('DOMContentLoaded', async () => {
    const apiKeysList = document.getElementById('apiKeysList');
    const firewallRulesList = document.getElementById('firewallRulesList');
    const createBtn = document.getElementById('createNewKeyBtn');
    const toast = document.getElementById('toast');

    let currentUser = null;

    // 1. التحقق من الهوية
    async function checkAuth() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = '/sign-in.html';
            return;
        }
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'admin') {
            alert('غير مصرح لك بالدخول لهذه الصفحة');
            window.location.href = '/';
            return;
        }
        currentUser = user;
        loadApiKeys();
        loadFirewallRules();
    }

    function showToast(msg) {
        toast.innerText = msg;
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    // 2. تحميل مفاتيح API
    async function loadApiKeys() {
        apiKeysList.innerHTML = '<div style="text-align:center; padding:2rem;">جاري التحميل...</div>';
        const { data: keys, error } = await supabase.from('bot_api_keys').select('*').order('created_at', { ascending: false });
        
        if (error) {
            apiKeysList.innerHTML = `<div style="color:red;">خطأ: ${error.message}</div>`;
            return;
        }

        if (!keys || keys.length === 0) {
            apiKeysList.innerHTML = '<div style="text-align:center; padding:2rem; color:#888;">لا توجد مفاتيح حالياً. قم بتوليد مفتاح جديد للبدء.</div>';
            return;
        }

        apiKeysList.innerHTML = '';
        keys.forEach(key => {
            const card = document.createElement('div');
            card.className = 'api-key-card';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <strong style="font-size:1.1rem; color:var(--primary-blue);">${key.name}</strong>
                            <span class="status-badge status-${key.status}">${key.status.toUpperCase()}</span>
                        </div>
                        <div style="color:#666; font-size:0.85rem; margin-top:5px;">🌐 ${key.website_url || 'جميع المواقع'}</div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <select class="status-select" data-id="${key.id}" style="padding:5px; border-radius:5px; border:1px solid #ddd;">
                            <option value="active" ${key.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="read_only" ${key.status === 'read_only' ? 'selected' : ''}>Read Only</option>
                            <option value="rate_limited" ${key.status === 'rate_limited' ? 'selected' : ''}>Rate Limited</option>
                            <option value="maintenance" ${key.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
                        </select>
                        <button class="delete-key-btn" data-id="${key.id}" style="background:#fff5f5; color:#ff4d4d; border:1px solid #ffebeb; padding:5px 10px; border-radius:5px; cursor:pointer;">حذف</button>
                    </div>
                </div>
                <div class="key-display">
                    <span id="key-${key.id}">${key.key_value.substring(0, 10)}****************${key.key_value.substring(key.key_value.length - 5)}</span>
                    <button class="copy-btn" data-key="${key.key_value}" style="background:none; border:none; color:var(--primary-blue); cursor:pointer; font-weight:700;">نسخ المفتاح</button>
                </div>
                <div style="font-size:0.8rem; color:#888;">
                    الصلاحيات: ${key.permissions.join(' | ')}
                </div>
            `;
            apiKeysList.appendChild(card);
        });

        // Attach events
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.onclick = () => {
                navigator.clipboard.writeText(btn.dataset.key);
                showToast('تم نسخ المفتاح إلى الحافظة');
            };
        });

        document.querySelectorAll('.status-select').forEach(select => {
            select.onchange = async () => {
                const id = select.dataset.id;
                const status = select.value;
                const { error } = await supabase.from('bot_api_keys').update({ status }).eq('id', id);
                if (!error) {
                    showToast('تم تحديث حالة المفتاح');
                    loadApiKeys();
                }
            };
        });

        document.querySelectorAll('.delete-key-btn').forEach(btn => {
            btn.onclick = async () => {
                if (!confirm('هل أنت متأكد من حذف هذا المفتاح؟')) return;
                const id = btn.dataset.id;
                const { error } = await supabase.from('bot_api_keys').delete().eq('id', id);
                if (!error) {
                    showToast('تم حذف المفتاح بنجاح');
                    loadApiKeys();
                }
            };
        });
    }

    // 3. توليد مفتاح جديد
    createBtn.onclick = async () => {
        const name = prompt('أدخل اسم التطبيق أو الموقع:');
        if (!name) return;
        const website = prompt('أدخل رابط الموقع (اختياري):', '');
        
        const newKey = 'mb_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        
        const { error } = await supabase.from('bot_api_keys').insert([{
            name: name,
            website_url: website,
            key_value: newKey,
            status: 'active',
            permissions: ['chat:send', 'memory:read'],
            created_by: currentUser.id
        }]);

        if (error) alert('خطأ: ' + error.message);
        else {
            showToast('تم توليد المفتاح بنجاح');
            loadApiKeys();
        }
    };

    // 4. تحميل قواعد الجدار الناري
    async function loadFirewallRules() {
        const { data: rules, error } = await supabase.from('memory_firewall_rules').select('*');
        if (error) return;

        firewallRulesList.innerHTML = '';
        rules.forEach(rule => {
            const div = document.createElement('div');
            div.style = 'display:flex; justify-content:space-between; align-items:center; padding:1rem; border:1px solid #eee; border-radius:10px; margin-bottom:0.5rem;';
            div.innerHTML = `
                <div>
                    <strong style="color:var(--primary-blue);">${rule.rule_type}</strong>
                    <div style="font-size:0.8rem; color:#666;">${rule.description}</div>
                </div>
                <label class="switch">
                    <input type="checkbox" class="rule-toggle" data-id="${rule.id}" ${rule.is_active ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            `;
            firewallRulesList.appendChild(div);
        });

        document.querySelectorAll('.rule-toggle').forEach(toggle => {
            toggle.onchange = async () => {
                const id = toggle.dataset.id;
                const is_active = toggle.checked;
                await supabase.from('memory_firewall_rules').update({ is_active }).eq('id', id);
                showToast('تم تحديث قاعدة الحماية');
            };
        });
    }

    checkAuth();
});
