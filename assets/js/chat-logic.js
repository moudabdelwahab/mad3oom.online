import { supabase } from '../../api-config.js';

document.addEventListener('DOMContentLoaded', async () => {
    // UI Elements
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');
    
    // Admin UI Elements
    const adminTabs = document.getElementById('adminTabs');
    const sessionsSidebar = document.getElementById('sessionsSidebar');
    const sessionsList = document.getElementById('sessionsList');
    const chatView = document.getElementById('chatView');
    const settingsView = document.getElementById('settingsView');
    const headerName = document.getElementById('headerName');
    const headerStatus = document.getElementById('headerStatus');
    const headerAvatar = document.getElementById('headerAvatar');
    const backBtn = document.getElementById('backBtn');
    
    let currentUser = null;
    let isAdmin = false;
    let currentSessionId = null;
    let botSettings = null;
    let currentKeywords = [];
    let customReplies = [];

    // 1. Auth Initialization
    async function initAuth() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            currentUser = user;
            // Check role from profiles table
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            if (profile && profile.role === 'admin') {
                isAdmin = true;
                setupAdminEnvironment();
            } else {
                setupUserEnvironment();
            }
        } else {
            // Guest logic if applicable, otherwise redirect
            const guestSession = localStorage.getItem('mad3oom-guest-session');
            if (guestSession) {
                currentUser = JSON.parse(guestSession);
                setupUserEnvironment();
            } else {
                window.location.href = '/sign-in.html';
            }
        }
    }

    // 2. Admin Setup
    function setupAdminEnvironment() {
        adminTabs.style.display = 'flex';
        sessionsSidebar.style.display = 'flex';
        if (backBtn) backBtn.innerText = 'العودة للوحة التحكم';
        
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (btn.dataset.view === 'chat') {
                    chatView.style.display = 'flex';
                    settingsView.style.display = 'none';
                } else {
                    chatView.style.display = 'none';
                    settingsView.style.display = 'block';
                    loadSettingsToForm();
                }
            });
        });

        loadAllSessions();
        subscribeToGlobalMessages();
    }

    async function loadAllSessions() {
        const { data: sessions } = await supabase
            .from('chat_sessions')
            .select('id, created_at, user_id, profiles(full_name)')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (sessions) {
            sessionsList.innerHTML = '';
            sessions.forEach(session => {
                const name = session.profiles?.full_name || 'مستخدم ضيف';
                const item = document.createElement('div');
                item.className = `session-item ${currentSessionId === session.id ? 'active' : ''}`;
                item.innerHTML = `
                    <div class="session-avatar">${name.charAt(0)}</div>
                    <div style="flex-grow: 1">
                        <div style="font-weight: 700; font-size: 0.9rem;">${name}</div>
                        <div style="font-size: 0.7rem; color: #666;">#${session.id.slice(0, 8)}</div>
                    </div>
                `;
                item.onclick = () => {
                    currentSessionId = session.id;
                    headerName.innerText = name;
                    headerStatus.innerText = 'مراقبة مباشرة';
                    headerAvatar.src = '/assets/images/technical-support.svg';
                    loadMessages();
                    document.querySelectorAll('.session-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                };
                sessionsList.appendChild(item);
            });
        }
    }

    function subscribeToGlobalMessages() {
        supabase.channel('global-chat')
            .on('postgres_changes', { event: 'INSERT', table: 'chat_messages' }, payload => {
                if (payload.new.session_id === currentSessionId) {
                    const isBot = payload.new.is_bot_reply;
                    const isMe = payload.new.sender_id === currentUser.id;
                    appendMessage(payload.new.message_text, isMe ? 'sent' : 'received', payload.new.created_at, isBot);
                }
                loadAllSessions(); // Refresh list to show activity
            })
            .subscribe();
    }

    // 3. User Setup
    async function setupUserEnvironment() {
        if (backBtn) backBtn.innerText = 'العودة للرئيسية';
        if (backBtn) backBtn.href = '/customer-dashboard.html';
        
        const { data: session } = await supabase
            .from('chat_sessions')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('status', 'active')
            .maybeSingle();

        if (session) {
            currentSessionId = session.id;
            loadMessages();
        } else {
            const { data: newS } = await supabase
                .from('chat_sessions')
                .insert([{ user_id: currentUser.id }])
                .select().single();
            currentSessionId = newS.id;
            if (botSettings?.is_enabled) {
                sendBotReply(botSettings.welcome_message);
            }
        }

        // Subscribe to my session only
        supabase.channel(`session-${currentSessionId}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                table: 'chat_messages',
                filter: `session_id=eq.${currentSessionId}` 
            }, payload => {
                if (payload.new.sender_id !== currentUser.id) {
                    appendMessage(payload.new.message_text, 'received', payload.new.created_at, payload.new.is_bot_reply);
                }
            })
            .subscribe();
    }

    // 4. Bot Settings Logic
    async function loadBotSettings() {
        const { data } = await supabase.from('bot_settings').select('*').limit(1).maybeSingle();
        if (data) {
            botSettings = data;
            currentKeywords = data.trigger_keywords || [];
            customReplies = data.custom_replies || [];
        } else {
            botSettings = {
                is_enabled: true,
                welcome_message: 'أهلاً بك! كيف يمكننا مساعدتك؟',
                ticket_confirmation_message: 'تم فتح تذكرة دعم.',
                trigger_keywords: [],
                custom_replies: [],
                response_delay_seconds: 1,
                response_frequency: 'once'
            };
        }
    }

    function loadSettingsToForm() {
        document.getElementById('botEnabled').checked = botSettings.is_enabled;
        document.getElementById('welcomeMessage').value = botSettings.welcome_message || '';
        document.getElementById('ticketMessage').value = botSettings.ticket_confirmation_message || '';
        document.getElementById('responseDelay').value = botSettings.response_delay_seconds || 1;
        document.getElementById('responseFrequency').value = botSettings.response_frequency || 'once';
        renderKeywords();
        renderCustomReplies();
    }

    function renderKeywords() {
        const list = document.getElementById('keywordsList');
        list.innerHTML = '';
        currentKeywords.forEach((word, index) => {
            const tag = document.createElement('div');
            tag.className = 'keyword-tag';
            tag.innerHTML = `${word} <span style="cursor:pointer">&times;</span>`;
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
            div.className = 'form-group';
            div.style.padding = '10px';
            div.style.border = '1px solid #eee';
            div.style.borderRadius = '8px';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px">
                    <label style="font-size:0.8rem">الكلمة:</label>
                    <span style="color:red; cursor:pointer; font-size:0.8rem" class="del-reply">حذف</span>
                </div>
                <input type="text" class="form-control reply-trigger" value="${item.trigger}" style="margin-bottom:5px">
                <label style="font-size:0.8rem">الرد:</label>
                <textarea class="form-control reply-response" rows="1">${item.response}</textarea>
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
        document.querySelectorAll('#customRepliesList .form-group').forEach(group => {
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
            response_frequency: document.getElementById('responseFrequency').value,
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

    // 5. Messaging Core
    function appendMessage(text, type, timestamp = new Date(), isBot = false) {
        const time = new Date(timestamp).getTime();
        // Check for duplicates
        const existing = Array.from(chatMessages.children).find(m => m.dataset.time == time && m.innerText.includes(text));
        if (existing) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type} ${isBot ? 'bot-label' : ''}`;
        messageDiv.dataset.time = time;
        const date = new Date(timestamp);
        const timeStr = date.getHours() + ":" + date.getMinutes().toString().padStart(2, '0');
        messageDiv.innerHTML = `${text}<span class="message-time">${timeStr}</span>`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function loadMessages() {
        if (!currentSessionId) return;
        const { data: messages } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', currentSessionId)
            .order('created_at', { ascending: true });

        chatMessages.innerHTML = '';
        if (messages) {
            messages.forEach(msg => {
                const isMe = msg.sender_id === currentUser.id;
                appendMessage(msg.message_text, isMe ? 'sent' : 'received', msg.created_at, msg.is_bot_reply);
            });
        }
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || !currentSessionId) return;
        
        chatInput.value = '';
        appendMessage(text, 'sent');

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
        if (!botSettings?.is_enabled || isAdmin) return;
        const lowerText = userText.toLowerCase();
        
        // Custom Replies
        const matched = customReplies.find(r => r.trigger && lowerText.includes(r.trigger.toLowerCase()));
        if (matched) return sendBotReply(matched.response);

        // Ticket Triggers
        if (currentKeywords.some(k => lowerText.includes(k.toLowerCase()))) {
            sendBotReply(botSettings.ticket_confirmation_message);
            await supabase.from('tickets').insert([{
                user_id: currentUser.id,
                title: 'تذكرة تلقائية',
                description: userText,
                status: 'open'
            }]);
        }
    }

    async function sendBotReply(text) {
        typingIndicator.style.display = 'block';
        setTimeout(async () => {
            typingIndicator.style.display = 'none';
            appendMessage(text, 'received', new Date(), true);
            await supabase.from('chat_messages').insert([{
                session_id: currentSessionId,
                message_text: text,
                is_bot_reply: true
            }]);
        }, (botSettings.response_delay_seconds || 1) * 1000);
    }

    // Event Listeners
    sendBtn.onclick = sendMessage;
    chatInput.onkeypress = (e) => e.key === 'Enter' && sendMessage();

    // Start
    await loadBotSettings();
    await initAuth();
});
