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
    const backLink = document.getElementById('backLink');

    let currentUser = null;
    let isAdmin = false;
    let currentSessionId = null;
    let botSettings = null;
    let currentKeywords = [];
    let customReplies = [];
    let isTestMode = false;

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
            } else {
                setupUserChat();
            }
        } else {
            // Check for guest in localStorage (from auth-client.js logic)
            const guestData = localStorage.getItem('sb-guest-session');
            if (guestData) {
                currentUser = JSON.parse(guestData);
                setupUserChat();
            } else if (window.isCustomerChat) {
                // If it's customer chat and no user/guest, we can allow anonymous chat or redirect
                // For now, let's create a temporary guest ID if none exists to allow the chat to work
                const tempGuestId = 'guest-' + Math.random().toString(36).substr(2, 9);
                currentUser = { id: tempGuestId, email: 'guest@mad3oom.online', isGuest: true };
                setupUserChat();
            } else {
                window.location.href = '/sign-in.html';
            }
        }
    }

    // 2. Sidebar Navigation Logic
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // Switch Views
            Object.values(views).forEach(v => v.classList.remove('active'));
            
            if (target === 'customer-chats') {
                views['customer-chats'].classList.add('active');
                isTestMode = false;
                loadAllSessions();
            } else if (target === 'bot-settings') {
                views['bot-settings'].classList.add('active');
                loadSettingsToForm();
            } else if (target === 'bot-test') {
                isTestMode = true;
                setupTestChat();
            }
        });
    });

    // 3. Admin: Load Sessions List
    async function loadAllSessions() {
        const { data: sessions } = await supabase
            .from('chat_sessions')
            .select('id, created_at, user_id, profiles(full_name)')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        const grid = document.getElementById('sessionsGrid');
        grid.innerHTML = '';
        
        if (sessions && sessions.length > 0) {
            sessions.forEach(session => {
                const name = session.profiles?.full_name || 'مستخدم ضيف';
                const card = document.createElement('div');
                card.className = 'session-card';
                card.innerHTML = `
                    <div style="display:flex; align-items:center; gap:1rem;">
                        <div style="width:50px; height:50px; background:#eef2ff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#003366;">${name.charAt(0)}</div>
                        <div>
                            <div style="font-weight:700;">${name}</div>
                            <div style="font-size:0.8rem; color:#666;">#${session.id.slice(0,8)}</div>
                        </div>
                    </div>
                `;
                card.onclick = () => openAdminChat(session.id, name);
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = '<div style="text-align:center; grid-column:1/-1; padding:3rem;">لا توجد محادثات نشطة حالياً.</div>';
        }
    }

    function openAdminChat(sessionId, name) {
        currentSessionId = sessionId;
        isTestMode = false;
        chatHeaderName.innerText = name;
        chatHeaderStatus.innerText = 'مراقبة مباشرة للعميل';
        chatHeaderImg.src = '/assets/images/technical-support.svg';
        
        Object.values(views).forEach(v => v.classList.remove('active'));
        views['chat-window'].classList.add('active');
        loadMessages();
    }

    function setupTestChat() {
        currentSessionId = 'test-session';
        chatHeaderName.innerText = 'تجربة البوت الذكي';
        chatHeaderStatus.innerText = 'وضع الاختبار - لن يتم حفظ الرسائل';
        chatHeaderImg.src = '/assets/images/mad3oom-robot.png';
        chatMessages.innerHTML = '';
        
        Object.values(views).forEach(v => v.classList.remove('active'));
        views['chat-window'].classList.add('active');
        
        appendMessage(botSettings.welcome_message, 'received', new Date(), true);
    }

    async function setupUserChat() {
        if (backLink) {
            backLink.innerText = 'العودة للرئيسية';
            backLink.href = '/customer-dashboard.html';
        }
        
        // If user is a guest with a non-UUID string, we can't store it in a UUID column
        // We'll use a fallback or just skip DB storage for non-auth guests for now to prevent errors
        const isRealUser = currentUser.id && currentUser.id.length > 20; // Simple UUID check

        if (isRealUser) {
            const { data: session } = await supabase.from('chat_sessions').select('id').eq('user_id', currentUser.id).eq('status', 'active').maybeSingle();
            if (session) {
                currentSessionId = session.id;
            } else {
                const { data: newS, error } = await supabase.from('chat_sessions').insert([{ user_id: currentUser.id }]).select().single();
                if (!error && newS) currentSessionId = newS.id;
            }
        } else {
            // For guests, we use a local session ID to allow bot interaction without DB errors
            currentSessionId = 'guest-session-' + currentUser.id;
            isTestMode = true; // Treat as test mode to avoid DB inserts
        }
        
        if (views['chat-window']) views['chat-window'].classList.add('active');
        loadMessages();
        
        // Auto welcome if new
        if (chatMessages && chatMessages.children.length === 0 && botSettings?.is_enabled) {
            appendMessage(botSettings.welcome_message, 'received', new Date(), true);
        }
    }

    // 4. Settings Logic
    async function loadBotSettings() {
        const { data } = await supabase.from('bot_settings').select('*').limit(1).maybeSingle();
        if (data) {
            botSettings = data;
            currentKeywords = data.trigger_keywords || [];
            customReplies = data.custom_replies || [];
        }
    }

    function loadSettingsToForm() {
        document.getElementById('botEnabled').checked = botSettings.is_enabled;
        document.getElementById('welcomeMessage').value = botSettings.welcome_message || '';
        document.getElementById('ticketMessage').value = botSettings.ticket_confirmation_message || '';
        document.getElementById('responseDelay').value = botSettings.response_delay_seconds || 1;
        renderKeywords();
        renderCustomReplies();
    }

    function renderKeywords() {
        const list = document.getElementById('keywordsList');
        list.innerHTML = '';
        currentKeywords.forEach((word, index) => {
            const tag = document.createElement('div');
            tag.style = 'background:#003366; color:white; padding:0.3rem 0.8rem; border-radius:20px; font-size:0.85rem; display:flex; align-items:center; gap:0.5rem;';
            tag.innerHTML = `${word} <span style="cursor:pointer; font-weight:bold;">&times;</span>`;
            tag.querySelector('span').onclick = () => {
                currentKeywords.splice(index, 1);
                renderKeywords();
            };
            list.appendChild(tag);
        });
    }

    function renderCustomReplies() {
        const list = document.getElementById('customRepliesList');
        list.innerHTML = '';
        customReplies.forEach((item, index) => {
            const div = document.createElement('div');
            div.style = 'background:#f8f9fa; padding:1rem; border-radius:8px; margin-bottom:1rem; border:1px solid #eee;';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                    <label style="font-size:0.8rem; font-weight:bold;">الكلمة المفتاحية:</label>
                    <span style="color:red; cursor:pointer; font-size:0.8rem;" class="del-reply">حذف</span>
                </div>
                <input type="text" class="form-input reply-trigger" value="${item.trigger}" style="margin-bottom:0.8rem;">
                <label style="font-size:0.8rem; font-weight:bold;">رد البوت:</label>
                <textarea class="form-input reply-response" rows="1">${item.response}</textarea>
            `;
            div.querySelector('.del-reply').onclick = () => {
                customReplies.splice(index, 1);
                renderCustomReplies();
            };
            list.appendChild(div);
        });
    }

    document.getElementById('keywordInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (val && !currentKeywords.includes(val)) {
                currentKeywords.push(val);
                renderKeywords();
            }
            e.target.value = '';
        }
    });

    document.getElementById('addCustomReply')?.addEventListener('click', () => {
        customReplies.push({ trigger: '', response: '' });
        renderCustomReplies();
    });

    document.getElementById('saveBotSettings')?.addEventListener('click', async () => {
        const btn = document.getElementById('saveBotSettings');
        btn.disabled = true;
        
        const updatedCustomReplies = [];
        document.querySelectorAll('#customRepliesList > div').forEach(group => {
            const t = group.querySelector('.reply-trigger').value.trim();
            const r = group.querySelector('.reply-response').value.trim();
            if (t && r) updatedCustomReplies.push({ trigger: t, response: r });
        });

        const settings = {
            is_enabled: document.getElementById('botEnabled').checked,
            welcome_message: document.getElementById('welcomeMessage').value,
            ticket_confirmation_message: document.getElementById('ticketMessage').value,
            trigger_keywords: currentKeywords,
            custom_replies: updatedCustomReplies,
            response_delay_seconds: parseInt(document.getElementById('responseDelay').value) || 1,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase.from('bot_settings').update(settings).eq('id', botSettings.id);
        if (!error) {
            botSettings = { ...botSettings, ...settings };
            const alert = document.getElementById('settingsAlert');
            alert.style.display = 'block';
            setTimeout(() => alert.style.display = 'none', 3000);
        }
        btn.disabled = false;
    });

    // 5. Chat Messaging Core
    function appendMessage(text, type, timestamp = new Date(), isBot = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `msg ${type}`;
        if (isBot) messageDiv.style.borderRight = '4px solid #003366';
        
        const date = new Date(timestamp);
        const timeStr = date.getHours() + ":" + date.getMinutes().toString().padStart(2, '0');
        messageDiv.innerHTML = `${text}<span style="display:block; font-size:0.7rem; opacity:0.6; margin-top:0.3rem;">${timeStr}</span>`;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function loadMessages() {
        if (!currentSessionId || isTestMode) return;
        const { data: messages } = await supabase.from('chat_messages').select('*').eq('session_id', currentSessionId).order('created_at', { ascending: true });
        chatMessages.innerHTML = '';
        if (messages) {
            messages.forEach(msg => {
                const type = msg.sender_id === currentUser.id ? 'sent' : 'received';
                appendMessage(msg.message_text, type, msg.created_at, msg.is_bot_reply);
            });
        }
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        
        chatInput.value = '';
        appendMessage(text, 'sent');

        if (isTestMode) {
            handleBotLogic(text);
            return;
        }

        const { error } = await supabase.from('chat_messages').insert([{
            session_id: currentSessionId,
            sender_id: currentUser.id,
            message_text: text,
            is_bot_reply: false
        }]);

        if (!error && !isAdmin) {
            handleBotLogic(text);
        }
    }

    async function handleBotLogic(userText) {
        if (!botSettings?.is_enabled || (isAdmin && !isTestMode)) return;
        
        const lowerText = userText.toLowerCase();
        
        // Custom Replies
        const matched = customReplies.find(r => r.trigger && lowerText.includes(r.trigger.toLowerCase()));
        if (matched) return sendBotReply(matched.response);

        // Ticket Triggers
        if (currentKeywords.some(k => lowerText.includes(k.toLowerCase()))) {
            sendBotReply(botSettings.ticket_confirmation_message);
            if (!isTestMode) {
                await supabase.from('tickets').insert([{
                    user_id: currentUser.id,
                    title: 'تذكرة تلقائية',
                    description: userText,
                    status: 'open'
                }]);
            }
        }
    }

    async function sendBotReply(text) {
        typingIndicator.style.display = 'block';
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        setTimeout(async () => {
            typingIndicator.style.display = 'none';
            appendMessage(text, 'received', new Date(), true);
            
            if (!isTestMode) {
                await supabase.from('chat_messages').insert([{
                    session_id: currentSessionId,
                    message_text: text,
                    is_bot_reply: true
                }]);
            }
        }, (botSettings.response_delay_seconds || 1) * 1000);
    }

    // UI Events
    sendBtn.onclick = sendMessage;
    chatInput.onkeypress = (e) => e.key === 'Enter' && sendMessage();
    closeChatBtn.onclick = () => {
        if (isAdmin) {
            views['chat-window'].classList.remove('active');
            views['customer-chats'].classList.add('active');
            menuItems.forEach(i => i.classList.remove('active'));
            document.querySelector('[data-target="customer-chats"]').classList.add('active');
        }
    };

    // Initialize
    await loadBotSettings();
    await initAuth();
});
