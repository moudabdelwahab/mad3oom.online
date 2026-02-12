import { supabase } from '../../api-config.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Core Elements
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');
    
    // Sidebar & View Elements
    const mainSidebar = document.querySelector('.control-sidebar');
    const menuItems = document.querySelectorAll('.menu-item');
    const views = {
        'customer-chats': document.getElementById('customer-chats-view'),
        'chat-window': document.getElementById('chat-window-view'),
        'bot-settings': document.getElementById('bot-settings-view')
    };
    
    // Header Elements
    const chatHeaderName = document.getElementById('chatHeaderName');
    const chatHeaderStatus = document.getElementById('chatHeaderStatus');
    const chatHeaderImg = document.getElementById('chatHeaderImg');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const endChatBtn = document.getElementById('endChatBtn');

    let currentUser = null;
    let isAdmin = false;
    let currentSessionId = null;
    let messageChannel = null;
    let modeChannel = null;
    let adminRealtimeChannel = null;
    let currentTicketId = null;
    let botSettings = null;
    let isTestMode = false;
    let isManualMode = false;

    // 1. Initialize Auth
    async function initAuth() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                currentUser = user;
                const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
                if (profile && profile.role === 'admin' && !window.isCustomerChat) {
                    isAdmin = true;
                    if (mainSidebar) mainSidebar.style.display = 'flex';
                    loadAllSessions();
                    subscribeToAllSessions();
                } else {
                    setupUserChat();
                }
            } else {
                let guestId = localStorage.getItem('mad3oom-guest-id');
                if (!guestId) {
                    guestId = 'guest-' + Math.random().toString(36).substr(2, 9);
                    localStorage.setItem('mad3oom-guest-id', guestId);
                }
                currentUser = { id: guestId, email: 'guest@mad3oom.online', isGuest: true };
                setupUserChat();
            }
        } catch (error) {
            console.error("Auth initialization error:", error);
        }
    }

    // 2. Sidebar Navigation Logic
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;
            if (!target) return;

            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
            
            if (target === 'customer-chats' || item.querySelector('span')?.innerText === 'محادثات العملاء') {
                if (views['customer-chats']) views['customer-chats'].classList.add('active');
                isTestMode = false;
                loadAllSessions();
            } else if (target === 'bot-settings') {
                if (views['bot-settings']) views['bot-settings'].classList.add('active');
                loadSettingsToForm();
            } else if (target === 'bot-test') {
                isTestMode = true;
                setupTestChat();
            }
        });
    });

    // 3. Admin: Load Sessions List
    async function loadAllSessions() {
        const grid = document.getElementById('sessionsGrid');
        if (!grid) return;

        try {
            const { data: sessions, error } = await supabase
                .from('chat_sessions')
                .select(`
                    id, 
                    created_at, 
                    updated_at,
                    user_id,
                    guest_id,
                    status,
                    is_manual_mode,
                    chat_messages(message_text, created_at)
                `)
                .eq('status', 'active')
                .order('updated_at', { ascending: false });

            if (error) throw error;
            
            if (!sessions || sessions.length === 0) {
                grid.innerHTML = '<div style="text-align:center; grid-column:1/-1; padding:3rem; color:#888;">لا توجد محادثات نشطة حالياً.</div>';
                return;
            }

            grid.innerHTML = '';
            for (const session of sessions) {
                try {
                    let name = 'مستخدم ضيف';
                    if (!session.guest_id && session.user_id) {
                        const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', session.user_id).single();
                        if (profile && profile.full_name) name = profile.full_name;
                    }
                    
                    const safeName = (name || 'مستخدم').toString();
                    const firstChar = (safeName && safeName.length > 0) ? safeName.charAt(0) : 'م';
                    
                    let lastMsg = 'بدأ محادثة جديدة...';
                    if (session.chat_messages && session.chat_messages.length > 0) {
                        const sortedMsgs = [...session.chat_messages].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
                        if (sortedMsgs[0] && sortedMsgs[0].message_text) {
                            lastMsg = sortedMsgs[0].message_text;
                        }
                    }
                    
                    const dateObj = new Date(session.updated_at || session.created_at);
                    const time = dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                    const date = dateObj.toLocaleDateString('ar-EG');
                    
                    const card = document.createElement('div');
                    card.className = 'session-card';
                    card.id = `session-${session.id}`;
		                    card.innerHTML = `
		                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2px;">
		                            <div style="display: flex; align-items: center; gap: 0.5rem;">
	                                    <input type="checkbox" class="user-select-checkbox" data-user-id="${session.user_id || session.guest_id}" data-user-name="${safeName}" style="width: 16px; height: 16px; cursor: pointer;">
	                                    <span class="card-tag" style="background:${session.is_manual_mode ? '#fff3cd' : '#d1e7dd'}; color:${session.is_manual_mode ? '#856404' : '#0f5132'}; font-size: 0.6rem;">
	                                        ${session.is_manual_mode ? 'رد يدوي' : 'بوت نشط'}
	                                    </span>
	                                </div>
		                            <button class="end-chat-btn-small" style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca; padding:2px 8px; border-radius:4px; font-size:0.7rem; font-weight:bold; cursor:pointer;">إغلاق المحادثة</button>
		                        </div>
		                        
		                        <div style="display:flex; align-items:center; gap:0.75rem;">
		                            <div style="width:36px; height:36px; background:#eef2ff; border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#003366; font-size:1rem; flex-shrink:0;">${firstChar}</div>
		                            <div style="overflow:hidden; flex-grow:1;">
		                                <div style="font-weight:700; color:#1a1a1a; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${safeName}</div>
		                                <div style="font-size:0.65rem; color:#999;">${date} | ${time}</div>
		                            </div>
		                        </div>

		                        <div class="last-message-preview" style="background:#f8f9fa; padding:0.6rem; border-radius:8px; font-size:0.8rem; color:#666; line-height:1.3; height:40px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; border:1px solid #f1f5f9;">
		                            ${lastMsg}
		                        </div>

		                        <div style="display: flex; gap: 0.5rem; margin-top: auto;">
                                <button class="view-chat-btn" style="flex: 1; background:var(--primary-blue); color:white; border:none; padding:8px; border-radius:8px; cursor:pointer; font-size:0.85rem; font-weight:600;">
                                    عرض المحادثة
                                </button>
                                <button class="quick-msg-btn" data-user-id="${session.user_id || session.guest_id}" data-user-name="${safeName}" title="إرسال رسالة مباشرة" style="background: #eef2ff; color: var(--primary-blue); border: 1px solid #d0d7ff; padding: 8px 12px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                </button>
                            </div>
		                    `;

	                        const checkbox = card.querySelector('.user-select-checkbox');
	                        checkbox.onclick = (e) => e.stopPropagation();
	                        checkbox.onchange = (e) => updateSelectedUsers();

	                        const quickMsgBtn = card.querySelector('.quick-msg-btn');
	                        quickMsgBtn.onclick = (e) => {
	                            e.stopPropagation();
	                            openQuickMessage(quickMsgBtn.dataset.userId, quickMsgBtn.dataset.userName);
	                        };

                    const viewBtn = card.querySelector('.view-chat-btn');
                    const endBtn = card.querySelector('.end-chat-btn-small');

                    viewBtn.onclick = (e) => {
                        e.stopPropagation();
                        openAdminChat(session.id, safeName, session.is_manual_mode);
                    };
                    
                    endBtn.onclick = async (e) => {
                        e.stopPropagation();
                        if (confirm('هل أنت متأكد من رغبتك في إغلاق هذه المحادثة؟')) {
                            const { error } = await supabase.from('chat_sessions').update({ status: 'closed', updated_at: new Date() }).eq('id', session.id);
                            if (!error) loadAllSessions();
                            else alert('حدث خطأ أثناء إغلاق المحادثة');
                        }
                    };

                    card.onclick = () => openAdminChat(session.id, safeName, session.is_manual_mode);
                    grid.appendChild(card);
                } catch (sessionError) {
                    console.error("Error processing session:", session.id, sessionError);
                }
            }
        } catch (error) {
            console.error("Error loading sessions:", error);
            grid.innerHTML = '<div style="text-align:center; grid-column:1/-1; padding:3rem; color:red;">حدث خطأ أثناء تحميل المحادثات. يرجى المحاولة مرة أخرى.</div>';
        }
    }

    function subscribeToAllSessions() {
        if (!isAdmin) return;
        if (adminRealtimeChannel) supabase.removeChannel(adminRealtimeChannel);

        console.log('[Chat Logic] Setting up admin realtime subscription for sessions and messages');
        adminRealtimeChannel = supabase.channel('admin-realtime-global')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_sessions' }, (payload) => {
                console.log("[Chat Logic] Session change detected:", payload);
                loadAllSessions();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
                console.log("[Chat Logic] New message detected:", payload);
                if (payload.new && !payload.new.is_admin_reply && !payload.new.is_bot_reply) {
                    loadAllSessions();
                }
            })
            .subscribe();
    }

    async function openAdminChat(sessionId, userName, manualMode) {
        currentSessionId = sessionId;
        isManualMode = manualMode;
        
        if (chatHeaderName) chatHeaderName.innerText = userName;
        if (chatHeaderStatus) chatHeaderStatus.innerText = manualMode ? 'وضع الرد اليدوي نشط' : 'البوت يتولى الرد حالياً';
        
        Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
        if (views['chat-window']) views['chat-window'].classList.add('active');
        
        loadMessages(sessionId);
        subscribeToMessages(sessionId);
    }

    async function loadMessages(sessionId) {
        if (chatMessages) chatMessages.innerHTML = '<div style="text-align:center; padding:2rem; color:#888;">جاري تحميل الرسائل...</div>';
        
        try {
            const { data: messages, error } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            
            if (chatMessages) {
                chatMessages.innerHTML = '';
                if (messages) {
                    messages.forEach(msg => {
                        const type = (msg.is_bot_reply || msg.is_admin_reply) ? 'sent' : 'received';
                        appendMessage(msg.message_text, type, msg.created_at);
                    });
                }
            }
        } catch (error) {
            console.error("Error loading messages:", error);
        }
    }

    function subscribeToMessages(sessionId) {
        if (messageChannel) supabase.removeChannel(messageChannel);
        
        messageChannel = supabase.channel(`session-${sessionId}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'chat_messages',
                filter: `session_id=eq.${sessionId}`
            }, (payload) => {
                const msg = payload.new;
                const type = (msg.is_bot_reply || msg.is_admin_reply) ? 'sent' : 'received';
                appendMessage(msg.message_text, type, msg.created_at);
            })
            .subscribe();
    }

    function appendMessage(text, type, timestamp) {
        if (!chatMessages) return;
        
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${type}`;
        
        const time = new Date(timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        
        msgDiv.innerHTML = `
            <div class="msg-text">${text}</div>
            <div style="font-size:0.65rem; opacity:0.7; margin-top:0.3rem; text-align:${type === 'sent' ? 'left' : 'right'}">${time}</div>
        `;
        
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        
        chatInput.value = '';
        
        if (isTestMode) {
            appendMessage(text, 'sent', new Date());
            handleBotReply(text);
            return;
        }

        if (!currentSessionId) return;

        try {
            const { error } = await supabase.from('chat_messages').insert([{ 
                session_id: currentSessionId, 
                message_text: text, 
                is_admin_reply: isAdmin,
                sender_id: currentUser.id
            }]);

            if (error) throw error;
            
            if (!isAdmin || !isManualMode) {
                handleBotReply(text);
            }
        } catch (error) {
            console.error("Error sending message:", error);
        }
    }

    async function handleBotReply(text) {
        if (!botSettings || !botSettings.bot_enabled) return;
        
        if (typingIndicator) typingIndicator.style.display = 'block';
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;

        setTimeout(async () => {
            if (typingIndicator) typingIndicator.style.display = 'none';
            
            let reply = "عذراً، لم أفهم طلبك. هل يمكنك التوضيح أكثر؟";
            
            if (botSettings?.smart_memory_enabled) {
                try {
                    const { data: memories } = await supabase
                        .from('smart_memory')
                        .select('reply_text')
                        .textSearch('keyword', text)
                        .limit(1);
                    if (memories && memories.length > 0) {
                        reply = memories[0].reply_text;
                    }
                } catch (err) {
                    console.error("Error searching smart memory:", err);
                }
            } else if (botSettings?.custom_replies) {
                const matched = botSettings.custom_replies.find(r => text.includes(r.keyword));
                if (matched) reply = matched.reply;
            }
            
            if (isTestMode) {
                appendMessage(reply, 'received', new Date());
            } else {
                await supabase.from('chat_messages').insert([{ 
                    session_id: currentSessionId, 
                    message_text: reply, 
                    is_bot_reply: true,
                    sender_id: 'bot'
                }]);
            }
        }, (botSettings?.response_delay_seconds || 1) * 1000);
    }

    async function loadBotSettings() {
        try {
            const { data } = await supabase.from('bot_settings').select('*').limit(1).maybeSingle();
            if (data) botSettings = data;
        } catch (error) {
            console.error("Error loading bot settings:", error);
        }
    }

    async function loadSettingsToForm() {
        if (!botSettings) await loadBotSettings();
        const enabledCheck = document.getElementById('botEnabled');
        const welcomeInput = document.getElementById('welcomeMessage');
        const smartMemoryCheck = document.getElementById('smartMemoryEnabled');
        if (enabledCheck && botSettings) enabledCheck.checked = botSettings.bot_enabled;
        if (welcomeInput && botSettings) welcomeInput.value = botSettings.welcome_message;
        if (smartMemoryCheck && botSettings) smartMemoryCheck.checked = botSettings.smart_memory_enabled;
    }

    function setupTestChat() {
        isTestMode = true;
        if (chatHeaderName) chatHeaderName.innerText = 'تجربة البوت الذكي';
        if (chatHeaderStatus) chatHeaderStatus.innerText = 'وضع الاختبار - لن يتم حفظ الرسائل';
        if (chatMessages) chatMessages.innerHTML = '';
        if (views['chat-window']) views['chat-window'].classList.add('active');
        if (botSettings) appendMessage(botSettings.welcome_message, 'received', new Date());
    }

    if (sendBtn) sendBtn.onclick = sendMessage;
    if (chatInput) chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
    if (closeChatBtn) {
        closeChatBtn.onclick = () => {
            if (isAdmin) {
                Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
                if (views['customer-chats']) views['customer-chats'].classList.add('active');
                loadAllSessions();
            }
        };
    }

    await loadBotSettings();
    await initAuth();
});

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
            if (userSearchResults) userSearchResults.style.display = 'none';
            if (userSearchInput) userSearchInput.value = '';
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
        ).slice(0, 10);

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

// تحديث قائمة المستخدمين المحددين من الـ checkboxes
function updateSelectedUsers() {
    const checkboxes = document.querySelectorAll('.user-select-checkbox:checked');
    const checkedUsers = Array.from(checkboxes).map(cb => ({
        id: cb.dataset.userId,
        name: cb.dataset.userName
    }));
    
    // دمج المختارين من الـ checkboxes مع المختارين من البحث دون تكرار
    checkedUsers.forEach(u => {
        if (!selectedUsers.find(su => su.id === u.id)) {
            selectedUsers.push(u);
        }
    });
    
    // إزالة غير المختارين من الـ checkboxes إذا كانوا قد اختيروا من هناك أصلاً
    const checkboxIds = checkedUsers.map(u => u.id);
    const currentlyInCheckboxes = Array.from(document.querySelectorAll('.user-select-checkbox')).map(cb => cb.dataset.userId);
    
    selectedUsers = selectedUsers.filter(u => {
        if (currentlyInCheckboxes.includes(u.id)) {
            return checkboxIds.includes(u.id);
        }
        return true; // إذا لم يكن في قائمة الـ checkboxes الحالية (تم اختياره من البحث) نتركه
    });

    updateSelectedUsersUI();
}

window.removeSelectedUser = (userId) => {
    selectedUsers = selectedUsers.filter(u => u.id !== userId);
    const cb = document.querySelector(`.user-select-checkbox[data-user-id="${userId}"]`);
    if (cb) cb.checked = false;
    updateSelectedUsersUI();
};

function openQuickMessage(userId, userName) {
    recipientType.value = 'selected';
    selectedUsersArea.style.display = 'block';
    selectedUsers = [{ id: userId, name: userName }];
    bulkModal.style.display = 'flex';
    updateSelectedUsersUI();
}

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

            const { data: { user } } = await supabase.auth.getUser();
            const currentAdminId = user?.id;

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

                    const { error: msgErr } = await supabase.from('chat_messages').insert({
                        session_id: sessionId,
                        message_text: text,
                        is_admin_reply: true,
                        sender_id: currentAdminId
                    });
                    if (msgErr) throw msgErr;

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
            document.querySelectorAll('.user-select-checkbox').forEach(cb => cb.checked = false);
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

const style = document.createElement('style');
style.textContent = `
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }
    .search-result-item:last-child { border-bottom: none; }
`;
document.head.appendChild(style);
