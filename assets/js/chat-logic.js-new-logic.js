
// --- ميزات الإرسال الجماعي والفردي المطورة ---

const bulkModal = document.getElementById('bulkMessageModal');
const bulkBtn = document.getElementById('bulkMessageBtn');
const closeBulk = document.getElementById('closeBulkModal');
const cancelBulk = document.getElementById('cancelBulkBtn');
const sendBulk = document.getElementById('sendBulkBtn');
const recipientType = document.getElementById('recipientType');
const selectedUsersArea = document.getElementById('selectedUsersArea');
const selectedUsersList = document.getElementById('selectedUsersList');
const userSearchInput = document.getElementById('userSearchInput');
const userSearchResults = document.getElementById('userSearchResults');

let selectedUsers = [];
let allProfiles = [];

// جلب جميع البروفايلات عند فتح النافذة لأول مرة
async function fetchAllProfiles() {
    if (allProfiles.length > 0) return;
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, full_name, email, username')
            .order('full_name');
        if (error) throw error;
        allProfiles = data || [];
    } catch (err) {
        console.error("Error fetching profiles:", err);
    }
}

// فتح نافذة الإرسال
if (bulkBtn) {
    bulkBtn.onclick = async () => {
        bulkModal.style.display = 'flex';
        await fetchAllProfiles();
        updateSelectedUsersUI();
    };
}

// إغلاق النافذة
[closeBulk, cancelBulk].forEach(btn => {
    if (btn) {
        btn.onclick = () => {
            bulkModal.style.display = 'none';
            userSearchResults.style.display = 'none';
            userSearchInput.value = '';
        };
    }
});

// تغيير نوع المستلمين
if (recipientType) {
    recipientType.onchange = () => {
        selectedUsersArea.style.display = recipientType.value === 'selected' ? 'block' : 'none';
    };
}

// منطق البحث عن المستخدمين
if (userSearchInput) {
    userSearchInput.oninput = () => {
        const term = userSearchInput.value.toLowerCase().trim();
        if (!term) {
            userSearchResults.style.display = 'none';
            return;
        }

        const filtered = allProfiles.filter(p => 
            (p.full_name && p.full_name.toLowerCase().includes(term)) || 
            (p.email && p.email.toLowerCase().includes(term)) ||
            (p.username && p.username.toLowerCase().includes(term))
        ).slice(0, 10); // عرض أول 10 نتائج فقط

        if (filtered.length === 0) {
            userSearchResults.innerHTML = '<div style="padding:10px; color:#999; text-align:center;">لا توجد نتائج</div>';
        } else {
            userSearchResults.innerHTML = filtered.map(p => `
                <div class="search-result-item" data-id="${p.id}" data-name="${p.full_name || p.username || p.email}" style="padding:10px; cursor:pointer; border-bottom:1px solid #eee; transition:background 0.2s;">
                    <div style="font-weight:600; font-size:0.9rem;">${p.full_name || p.username || 'بدون اسم'}</div>
                    <div style="font-size:0.75rem; color:#666;">${p.email || ''}</div>
                </div>
            `).join('');

            userSearchResults.querySelectorAll('.search-result-item').forEach(item => {
                item.onclick = () => {
                    const id = item.dataset.id;
                    const name = item.dataset.name;
                    if (!selectedUsers.find(u => u.id === id)) {
                        selectedUsers.push({ id, name });
                        updateSelectedUsersUI();
                    }
                    userSearchInput.value = '';
                    userSearchResults.style.display = 'none';
                };
                item.onmouseover = () => { item.style.background = '#f0f4ff'; };
                item.onmouseout = () => { item.style.background = 'white'; };
            });
        }
        userSearchResults.style.display = 'block';
    };
}

// إغلاق نتائج البحث عند الضغط خارجها
document.addEventListener('click', (e) => {
    if (userSearchResults && !userSearchResults.contains(e.target) && e.target !== userSearchInput) {
        userSearchResults.style.display = 'none';
    }
});

function updateSelectedUsersUI() {
    if (!selectedUsersList) return;
    selectedUsersList.innerHTML = '';
    
    if (selectedUsers.length === 0) {
        selectedUsersList.innerHTML = '<span style="color:#999; font-size:0.8rem;">لم يتم اختيار مستخدمين بعد</span>';
        return;
    }

    selectedUsers.forEach(user => {
        const tag = document.createElement('div');
        tag.style.cssText = 'background:#6366f1; color:white; padding:4px 10px; border-radius:20px; font-size:0.85rem; display:flex; align-items:center; gap:8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);';
        tag.innerHTML = `<span>${user.name}</span><span style="cursor:pointer; font-weight:bold; font-size:1.1rem; line-height:1;" onclick="removeSelectedUser('${user.id}')">&times;</span>`;
        selectedUsersList.appendChild(tag);
    });
}

window.removeSelectedUser = (userId) => {
    selectedUsers = selectedUsers.filter(u => u.id !== userId);
    updateSelectedUsersUI();
};

// فتح رسالة سريعة لمستخدم واحد من بطاقة المحادثة
function openQuickMessage(userId, userName) {
    recipientType.value = 'selected';
    selectedUsersArea.style.display = 'block';
    selectedUsers = [{ id: userId, name: userName }];
    bulkModal.style.display = 'flex';
    updateSelectedUsersUI();
}

// إرسال الرسائل
if (sendBulk) {
    sendBulk.onclick = async () => {
        const title = document.getElementById('bulkMessageTitle').value;
        const text = document.getElementById('bulkMessageText').value;
        const type = recipientType.value;

        if (!text) {
            alert('يرجى كتابة نص الرسالة');
            return;
        }

        if (type === 'selected' && selectedUsers.length === 0) {
            alert('يرجى اختيار مستخدم واحد على الأقل');
            return;
        }

        sendBulk.disabled = true;
        sendBulk.innerHTML = '<span style="display:flex; align-items:center; gap:5px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg> جاري الإرسال...</span>';

        try {
            let targetUserIds = [];

            if (type === 'all') {
                const { data: profiles } = await supabase.from('profiles').select('id');
                targetUserIds = profiles.map(p => p.id);
            } else if (type === 'active') {
                const { data: sessions } = await supabase.from('chat_sessions').select('user_id').eq('status', 'active');
                targetUserIds = [...new Set(sessions.map(s => s.user_id).filter(id => id && !id.startsWith('guest-')))];
            } else {
                targetUserIds = selectedUsers.map(u => u.id);
            }

            if (targetUserIds.length === 0) {
                alert('لم يتم العثور على مستخدمين للإرسال إليهم');
                resetSendBtn();
                return;
            }

            let successCount = 0;
            for (const userId of targetUserIds) {
                try {
                    // 1. إيجاد أو إنشاء جلسة محادثة
                    let sessionId;
                    const { data: session } = await supabase
                        .from('chat_sessions')
                        .select('id')
                        .eq('user_id', userId)
                        .eq('status', 'active')
                        .maybeSingle();

                    if (session) {
                        sessionId = session.id;
                    } else {
                        const { data: newSession, error: sessErr } = await supabase
                            .from('chat_sessions')
                            .insert({ user_id: userId, status: 'active', is_manual_mode: true })
                            .select()
                            .single();
                        if (sessErr) throw sessErr;
                        sessionId = newSession.id;
                    }

                    // 2. إرسال الرسالة
                    const { error: msgErr } = await supabase.from('chat_messages').insert({
                        session_id: sessionId,
                        message_text: text,
                        is_admin_reply: true,
                        sender_id: currentUser.id
                    });
                    if (msgErr) throw msgErr;

                    // 3. إنشاء إشعار
                    await supabase.from('notifications').insert({
                        user_id: userId,
                        title: title || 'رسالة جديدة من الإدارة',
                        message: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
                        type: 'message',
                        link: '/chat-customer.html'
                    });
                    
                    successCount++;
                } catch (innerErr) {
                    console.error(`Error sending to user ${userId}:`, innerErr);
                }
            }

            alert(`تم إرسال الرسالة بنجاح لـ ${successCount} مستخدم`);
            bulkModal.style.display = 'none';
            document.getElementById('bulkMessageTitle').value = '';
            document.getElementById('bulkMessageText').value = '';
            selectedUsers = [];
            updateSelectedUsersUI();
            
        } catch (error) {
            console.error('Error in bulk message process:', error);
            alert('حدث خطأ أثناء معالجة طلب الإرسال');
        } finally {
            resetSendBtn();
        }
    };
}

function resetSendBtn() {
    sendBulk.disabled = false;
    sendBulk.innerHTML = 'إرسال الآن';
}

// إضافة CSS للتحميل (Spin)
const style = document.createElement('style');
style.textContent = `
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }
    .search-result-item:last-child { border-bottom: none; }
`;
document.head.appendChild(style);
