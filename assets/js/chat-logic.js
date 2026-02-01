import { supabase } from '../../api-config.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Core Elements
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');
    
    // Sidebar & View Elements
    const mainSidebar = document.getElementById('mainSidebar');
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
    let currentTicketId = null;
    let botSettings = null;
    let isTestMode = false;
    let isManualMode = false; // Admin manual reply mode

    // 1. Initialize Auth
    async function initAuth() {
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
            // Handle Guest
            let guestId = localStorage.getItem('mad3oom-guest-id');
            if (!guestId) {
                guestId = 'guest-' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('mad3oom-guest-id', guestId);
            }
            currentUser = { id: guestId, email: 'guest@mad3oom.online', isGuest: true };
            setupUserChat();
        }
    }

    // 2. Sidebar Navigation Logic
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            Object.values(views).forEach(v => {
                if (v) v.classList.remove('active');
            });
            
            if (target === 'customer-chats') {
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
        const { data: sessions, error } = await supabase
            .from('chat_sessions')
            .select(`
                id, 
                created_at, 
                user_id,
                guest_id,
                status,
                is_manual_mode,
                chat_messages(message_text, created_at)
            `)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        const grid = document.getElementById('sessionsGrid');
        if (!grid) return;
        grid.innerHTML = '';
        
        if (sessions && sessions.length > 0) {
            for (const session of sessions) {
                let name = 'مستخدم ضيف';
                if (!session.guest_id && session.user_id) {
                    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', session.user_id).single();
                    if (profile) name = profile.full_name;
                }
                
                const lastMsg = session.chat_messages && session.chat_messages.length > 0 
                    ? session.chat_messages.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0].message_text 
                    : 'بدأ محادثة جديدة...';
                
                const dateObj = new Date(session.created_at);
                const time = dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                const date = dateObj.toLocaleDateString('ar-EG');
                
                const card = document.createElement('div');
                card.className = 'session-card';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <div style="width:40px; height:40px; background:#eef2ff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#003366;">${name.charAt(0)}</div>
                            <div>
                                <div style="font-weight:700; color:#333;">${name} ${session.guest_id ? '(ضيف)' : ''}</div>
                                <div style="font-size:0.7rem; color:#999;">${date} | ${time}</div>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:5px;">
                            <span style="font-size:0.7rem; padding:2px 8px; border-radius:10px; background:${session.is_manual_mode ? '#fff3cd' : '#d1e7dd'}; color:${session.is_manual_mode ? '#856404' : '#0f5132'};">
                                ${session.is_manual_mode ? 'رد يدوي' : 'بوت نشط'}
                            </span>
                            <button class="view-chat-btn" style="background:var(--primary-blue); color:white; border:none; padding:4px 12px; border-radius:5px; cursor:pointer; font-size:0.8rem;">عرض المحادثة</button>
                        </div>
                    </div>
                    <div style="font-size:0.85rem; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:3rem;">
                        ${lastMsg}
                    </div>
                `;
                card.querySelector('.view-chat-btn').onclick = (e) => {
                    e.stopPropagation();
                    openAdminChat(session.id, name, session.is_manual_mode);
                };
                card.onclick = () => openAdminChat(session.id, name, session.is_manual_mode);
                grid.appendChild(card);
            }
        } else {
            grid.innerHTML = '<div style="text-align:center; grid-column:1/-1; padding:3rem; color:#888;">لا توجد محادثات نشطة حالياً.</div>';
        }
    }

    function subscribeToAllSessions() {
        if (!isAdmin) return;
        supabase.channel('admin-sessions-list').on('postgres_changes', { event: '*', schema: 'public', table: 'chat_sessions' }, () => loadAllSessions()).subscribe();
        supabase.channel('admin-messages-updates').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => loadAllSessions()).subscribe();
    }

    async function openAdminChat(sessionId, name, manualMode) {
        currentSessionId = sessionId;
        isManualMode = manualMode;
        isTestMode = false;
        
        if (chatHeaderName) chatHeaderName.innerText = name;
        updateAdminChatHeader();
        
        Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
        if (views['chat-window']) views['chat-window'].classList.add('active');
        
        loadMessages();
        subscribeToMessages();
        
        // Add manual mode toggle button to header if not exists
        let toggleBtn = document.getElementById('manualModeToggle');
        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'manualModeToggle';
            toggleBtn.style = "margin-right:10px; padding:5px 15px; border-radius:20px; border:1px solid white; background:transparent; color:white; cursor:pointer; font-size:0.8rem;";
            document.querySelector('.chat-header-blue .bot-profile').appendChild(toggleBtn);
        }
        toggleBtn.innerText = isManualMode ? 'إيقاف الرد اليدوي' : 'تفعيل الرد اليدوي';
        toggleBtn.onclick = async () => {
            const newMode = !isManualMode;
            const { error } = await supabase.from('chat_sessions').update({ is_manual_mode: newMode }).eq('id', currentSessionId);
            if (!error) {
                isManualMode = newMode;
                toggleBtn.innerText = isManualMode ? 'إيقاف الرد اليدوي' : 'تفعيل الرد اليدوي';
                updateAdminChatHeader();
            }
        };
    }

    function updateAdminChatHeader() {
        if (chatHeaderStatus) {
            chatHeaderStatus.innerText = isManualMode ? 'أنت تتحدث الآن مع العميل' : 'البوت يقوم بالرد تلقائياً';
            chatHeaderStatus.style.color = isManualMode ? '#ffcc00' : 'white';
        }
        if (chatHeaderImg) chatHeaderImg.src = isManualMode ? '/assets/images/technical-support.svg' : '/assets/images/mad3oom-robot.png';
    }

    async function setupUserChat() {
        let sessionQuery = supabase.from('chat_sessions').select('id, is_manual_mode').eq('status', 'active');
        if (currentUser.isGuest) {
            sessionQuery = sessionQuery.eq('guest_id', currentUser.id);
        } else {
            sessionQuery = sessionQuery.eq('user_id', currentUser.id);
        }
        
        const { data: session } = await sessionQuery.maybeSingle();

        if (session) {
            currentSessionId = session.id;
            isManualMode = session.is_manual_mode;
        } else {
            const sessionData = { status: 'active' };
            if (currentUser.isGuest) sessionData.guest_id = currentUser.id;
            else sessionData.user_id = currentUser.id;
            
            const { data: newS, error } = await supabase.from('chat_sessions').insert([sessionData]).select().single();
            if (!error && newS) currentSessionId = newS.id;
        }
        
        if (views['chat-window']) views['chat-window'].classList.add('active');
        loadMessages();
        subscribeToMessages();
        
        // Listen for manual mode changes
        supabase.channel(`session-mode-${currentSessionId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_sessions', filter: `id=eq.${currentSessionId}` }, payload => {
                isManualMode = payload.new.is_manual_mode;
                if (chatHeaderStatus) chatHeaderStatus.innerText = isManualMode ? 'موظف الدعم متصل الآن' : 'متصل الآن';
                if (chatHeaderName) chatHeaderName.innerText = isManualMode ? 'الدعم الفني' : 'بوت مدعوم الذكي';
            }).subscribe();
            
        setTimeout(() => {
            if (chatMessages && chatMessages.children.length === 0 && botSettings && !isManualMode) {
                appendMessage(botSettings.welcome_message, 'received', new Date(), true);
            }
        }, 1000);
    }

    async function loadMessages() {
        if (!currentSessionId || isTestMode) return;
        const { data: messages } = await supabase.from('chat_messages').select('*').eq('session_id', currentSessionId).order('created_at', { ascending: true });
        if (chatMessages) {
            chatMessages.innerHTML = '';
            messages?.forEach(m => appendMessage(m.message_text, (m.is_bot_reply || m.is_admin_reply) ? 'received' : 'sent', m.created_at));
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function subscribeToMessages() {
        if (!currentSessionId || isTestMode) return;
        supabase.channel(`messages-${currentSessionId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${currentSessionId}` }, payload => {
                const isMine = isAdmin ? payload.new.is_admin_reply : (!payload.new.is_bot_reply && !payload.new.is_admin_reply);
                if (!isMine) appendMessage(payload.new.message_text, 'received', payload.new.created_at);
            }).subscribe();
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || !currentSessionId) return;

        chatInput.value = '';
        appendMessage(text, 'sent', new Date());
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;

        if (isTestMode) {
            handleBotLogic(text);
            return;
        }

        const msgData = { session_id: currentSessionId, message_text: text, sender_id: currentUser.id };
        if (isAdmin) {
            msgData.is_admin_reply = true;
            await supabase.from('chat_messages').insert([msgData]);
        } else {
            await supabase.from('chat_messages').insert([msgData]);
            if (!isManualMode) handleBotLogic(text);
        }
    }

    function appendMessage(text, type, time, isBot = false) {
        if (!chatMessages) return;
        const div = document.createElement('div');
        div.className = `msg ${type}`;
        div.innerText = text;
        const timeSpan = document.createElement('div');
        timeSpan.style = "font-size:0.65rem; opacity:0.6; margin-top:4px; text-align:" + (type === 'sent' ? 'left' : 'right');
        timeSpan.innerText = new Date(time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        div.appendChild(timeSpan);
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function handleBotLogic(text) {
        if (!botSettings?.is_enabled && !isTestMode) return;
        
        typingIndicator.style.display = 'block';
        setTimeout(async () => {
            typingIndicator.style.display = 'none';
            let reply = "عذراً، لم أفهم طلبك جيداً. هل يمكنك التوضيح؟";
            
            // Simple keyword matching from botSettings.custom_replies
            if (botSettings.custom_replies) {
                const matched = botSettings.custom_replies.find(r => text.includes(r.keyword));
                if (matched) reply = matched.reply;
            }

            appendMessage(reply, 'received', new Date(), true);
            if (!isTestMode) {
                await supabase.from('chat_messages').insert([{ session_id: currentSessionId, message_text: reply, is_bot_reply: true }]);
            }
        }, (botSettings?.response_delay_seconds || 1) * 1000);
    }

    async function loadBotSettings() {
        const { data } = await supabase.from('bot_settings').select('*').limit(1).maybeSingle();
        if (data) botSettings = data;
    }

    function setupTestChat() {
        isTestMode = true;
        if (chatHeaderName) chatHeaderName.innerText = 'تجربة البوت الذكي';
        if (chatHeaderStatus) chatHeaderStatus.innerText = 'وضع الاختبار - لن يتم حفظ الرسائل';
        if (chatMessages) chatMessages.innerHTML = '';
        if (views['chat-window']) views['chat-window'].classList.add('active');
        if (botSettings) appendMessage(botSettings.welcome_message, 'received', new Date(), true);
    }

    // Settings Form Logic (Placeholder for full implementation)
    async function loadSettingsToForm() {
        if (!botSettings) await loadBotSettings();
        const enabledCheck = document.getElementById('botEnabled');
        const welcomeInput = document.getElementById('welcomeMessage');
        if (enabledCheck) enabledCheck.checked = botSettings.is_enabled;
        if (welcomeInput) welcomeInput.value = botSettings.welcome_message;
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
