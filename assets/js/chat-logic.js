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

    // Rating Modal Elements
    const ratingModal = document.getElementById('ratingModal');
    const stars = document.querySelectorAll('.star');
    const submitRatingBtn = document.getElementById('submitRatingBtn');
    const ratingComment = document.getElementById('ratingComment');

    let currentUser = null;
    let isAdmin = false;
    let currentSessionId = null;
    let currentTicketId = null;
    let botSettings = null;
    let currentKeywords = [];
    let customReplies = [];
    let isTestMode = false;
    let selectedRating = 0;

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
                subscribeToAllSessions(); // Subscribe to new sessions for admin
            } else {
                setupUserChat();
            }
        } else {
            const guestData = localStorage.getItem('sb-guest-session');
            if (guestData) {
                currentUser = JSON.parse(guestData);
                setupUserChat();
            } else if (window.isCustomerChat) {
                // Create a persistent guest ID if not exists
                let guestId = localStorage.getItem('mad3oom-guest-id');
                if (!guestId) {
                    guestId = 'guest-' + Math.random().toString(36).substr(2, 9);
                    localStorage.setItem('mad3oom-guest-id', guestId);
                }
                currentUser = { id: guestId, email: 'guest@mad3oom.online', isGuest: true };
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
        const { data: sessions } = await supabase
            .from('chat_sessions')
            .select(`
                id, 
                created_at, 
                user_id, 
                profiles(full_name),
                chat_messages(message_text, created_at)
            `)
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        const grid = document.getElementById('sessionsGrid');
        if (!grid) return;
        grid.innerHTML = '';
        
        if (sessions && sessions.length > 0) {
            sessions.forEach(session => {
                const name = session.profiles?.full_name || 'مستخدم ضيف';
                const lastMsg = session.chat_messages && session.chat_messages.length > 0 
                    ? session.chat_messages.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0].message_text 
                    : 'بدأ محادثة جديدة...';
                const time = new Date(session.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                
                const card = document.createElement('div');
                card.className = 'session-card';
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                        <div style="display:flex; align-items:center; gap:0.75rem;">
                            <div style="width:40px; height:40px; background:#eef2ff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; color:#003366;">${name.charAt(0)}</div>
                            <div>
                                <div style="font-weight:700; color:#333;">${name}</div>
                                <div style="font-size:0.7rem; color:#999;">#${session.id.slice(0,8)}</div>
                            </div>
                        </div>
                        <div style="font-size:0.75rem; color:#888;">${time}</div>
                    </div>
                    <div style="font-size:0.85rem; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding-right:3rem;">
                        ${lastMsg}
                    </div>
                `;
                card.onclick = () => openAdminChat(session.id, name);
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = '<div style="text-align:center; grid-column:1/-1; padding:3rem; color:#888;">لا توجد محادثات نشطة حالياً.</div>';
        }
    }

    function subscribeToAllSessions() {
        if (!isAdmin) return;
        
        // Listen for new sessions
        supabase
            .channel('admin-sessions-list')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'chat_sessions'
            }, () => {
                if (views['customer-chats'] && views['customer-chats'].classList.contains('active')) {
                    loadAllSessions();
                }
            })
            .subscribe();

        // Also listen for new messages to update the "last message" in the list
        supabase
            .channel('admin-messages-updates')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages'
            }, () => {
                if (views['customer-chats'] && views['customer-chats'].classList.contains('active')) {
                    loadAllSessions();
                }
            })
            .subscribe();
    }

    function openAdminChat(sessionId, name) {
        currentSessionId = sessionId;
        isTestMode = false;
        if (chatHeaderName) chatHeaderName.innerText = name;
        if (chatHeaderStatus) chatHeaderStatus.innerText = 'مراقبة مباشرة للعميل';
        if (chatHeaderImg) chatHeaderImg.src = '/assets/images/technical-support.svg';
        
        Object.values(views).forEach(v => {
            if (v) v.classList.remove('active');
        });
        if (views['chat-window']) views['chat-window'].classList.add('active');
        loadMessages();
        subscribeToMessages();
    }

    function setupTestChat() {
        currentSessionId = 'test-session';
        if (chatHeaderName) chatHeaderName.innerText = 'تجربة البوت الذكي';
        if (chatHeaderStatus) chatHeaderStatus.innerText = 'وضع الاختبار - لن يتم حفظ الرسائل';
        if (chatHeaderImg) chatHeaderImg.src = '/assets/images/mad3oom-robot.png';
        if (chatMessages) chatMessages.innerHTML = '';
        
        Object.values(views).forEach(v => {
            if (v) v.classList.remove('active');
        });
        if (views['chat-window']) views['chat-window'].classList.add('active');
        
        if (botSettings) {
            appendMessage(botSettings.welcome_message, 'received', new Date(), true);
        }
    }

    async function setupUserChat() {
        // Try to find an active session for this user (real or guest)
        const { data: session } = await supabase
            .from('chat_sessions')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('status', 'active')
            .maybeSingle();

        if (session) {
            currentSessionId = session.id;
            // Check if there's an open ticket for this session
            const { data: ticket } = await supabase
                .from('tickets')
                .select('id')
                .eq('chat_session_id', currentSessionId)
                .eq('status', 'open')
                .maybeSingle();
            if (ticket) currentTicketId = ticket.id;
        } else {
            const { data: newS, error } = await supabase
                .from('chat_sessions')
                .insert([{ user_id: currentUser.id, status: 'active' }])
                .select()
                .single();
            if (!error && newS) currentSessionId = newS.id;
        }
        
        if (views['chat-window']) views['chat-window'].classList.add('active');
        loadMessages();
        subscribeToMessages();
        
        // Send welcome message if chat is empty
        setTimeout(() => {
            if (chatMessages && chatMessages.children.length === 0 && botSettings && botSettings.is_enabled) {
                appendMessage(botSettings.welcome_message, 'received', new Date(), true);
            }
        }, 1000);
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
        if (!botSettings) return;
        const botEnabled = document.getElementById('botEnabled');
        const welcomeMessage = document.getElementById('welcomeMessage');
        const ticketMessage = document.getElementById('ticketMessage');
        const responseDelay = document.getElementById('responseDelay');

        if (botEnabled) botEnabled.checked = botSettings.is_enabled;
        if (welcomeMessage) welcomeMessage.value = botSettings.welcome_message || '';
        if (ticketMessage) ticketMessage.value = botSettings.ticket_confirmation_message || '';
        if (responseDelay) responseDelay.value = botSettings.response_delay_seconds || 1;
        
        renderKeywords();
        renderCustomReplies();
    }

    function renderKeywords() {
        const list = document.getElementById('keywordsList');
        if (!list) return;
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
        if (!list) return;
        list.innerHTML = '';
        
        if (customReplies.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding:2rem; color:#888; font-style:italic;">لا توجد ردود مخصصة حالياً. اضغط على "إضافة رد جديد" للبدء.</div>';
            return;
        }

        customReplies.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'custom-reply-card';
            card.innerHTML = `
                <div class="reply-card-header">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <div class="reply-number">${index + 1}</div>
                        <span style="font-weight:700; color:#003366; font-size:0.9rem;">رد مخصص</span>
                    </div>
                    <button type="button" class="del-reply-btn">حذف الرد</button>
                </div>
                <div class="reply-grid">
                    <div>
                        <label style="font-size:0.85rem; font-weight:700; color:#555;">الكلمة المفتاحية</label>
                        <input type="text" class="form-input reply-trigger" value="${item.trigger || ''}" placeholder="مثال: الأسعار">
                    </div>
                    <div>
                        <label style="font-size:0.85rem; font-weight:700; color:#555;">رد البوت الذكي</label>
                        <textarea class="form-input reply-response" rows="2" placeholder="اكتب الرد الذي سيقوم البوت بإرساله...">${item.response || ''}</textarea>
                    </div>
                </div>
            `;
            card.querySelector('.del-reply-btn').onclick = () => {
                customReplies.splice(index, 1);
                renderCustomReplies();
            };
            list.appendChild(card);
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
        btn.innerText = 'جاري الحفظ...';
        
        const updatedCustomReplies = [];
        document.querySelectorAll('#customRepliesList .custom-reply-card').forEach(group => {
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

        try {
            const { error } = await supabase.from('bot_settings').update(settings).eq('id', botSettings.id);
            if (!error) {
                botSettings = { ...botSettings, ...settings };
                customReplies = [...updatedCustomReplies];
                const alert = document.getElementById('settingsAlert');
                if (alert) {
                    alert.style.display = 'block';
                    setTimeout(() => alert.style.display = 'none', 3000);
                }
            } else {
                console.error('Error updating settings:', error);
                alert('حدث خطأ أثناء حفظ الإعدادات');
            }
        } catch (err) {
            console.error('Unexpected error:', err);
        } finally {
            btn.disabled = false;
            btn.innerText = 'حفظ الإعدادات';
        }
    });

    // 5. Chat Messaging Core
    function appendMessage(text, type, timestamp = new Date(), isBot = false) {
        if (!chatMessages) return;
        
        // Check if message already exists to avoid duplicates from Realtime
        const existingMsgs = Array.from(chatMessages.querySelectorAll('.msg-text')).map(m => m.innerText);
        if (existingMsgs.includes(text)) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `msg ${type}`;
        if (isBot) messageDiv.style.borderRight = '4px solid #003366';
        
        const date = new Date(timestamp);
        const timeStr = date.getHours() + ":" + date.getMinutes().toString().padStart(2, '0');
        messageDiv.innerHTML = `<span class="msg-text">${text}</span><span style="display:block; font-size:0.7rem; opacity:0.6; margin-top:0.3rem;">${timeStr}</span>`;
        
        chatMessages.appendChild(messageDiv);
        
        // Ensure scrolling happens after DOM update
        setTimeout(() => {
            chatMessages.scrollTo({
                top: chatMessages.scrollHeight,
                behavior: 'smooth'
            });
        }, 50);
    }

    async function loadMessages() {
        if (!currentSessionId || isTestMode || !chatMessages) return;
        const { data: messages } = await supabase.from('chat_messages').select('*').eq('session_id', currentSessionId).order('created_at', { ascending: true });
        chatMessages.innerHTML = '';
        if (messages) {
            messages.forEach(msg => {
                const type = msg.sender_id === currentUser.id ? 'sent' : 'received';
                appendMessage(msg.message_text, type, msg.created_at, msg.is_bot_reply);
            });
        }
    }

    function subscribeToMessages() {
        if (!currentSessionId || isTestMode) return;
        
        supabase
            .channel(`chat:${currentSessionId}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'chat_messages',
                filter: `session_id=eq.${currentSessionId}`
            }, payload => {
                const msg = payload.new;
                if (msg.sender_id !== currentUser.id) {
                    appendMessage(msg.message_text, 'received', msg.created_at, msg.is_bot_reply);
                }
            })
            .subscribe();
    }

    async function sendMessage() {
        if (!chatInput) return;
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
        if (!botSettings || !botSettings.is_enabled || (isAdmin && !isTestMode)) return;
        
        const lowerText = userText.toLowerCase();
        
        // 1. Check Custom Replies (Priority)
        const matched = customReplies.find(r => r.trigger && lowerText.includes(r.trigger.toLowerCase()));
        if (matched) return sendBotReply(matched.response);

        // 2. Check Ticket Triggers
        if (currentKeywords.some(k => lowerText.includes(k.toLowerCase()))) {
            sendBotReply(botSettings.ticket_confirmation_message);
            if (!isTestMode) {
                // Get all messages in current session to include in ticket description
                const { data: messages } = await supabase
                    .from('chat_messages')
                    .select('message_text, is_bot_reply, created_at')
                    .eq('session_id', currentSessionId)
                    .order('created_at', { ascending: true });
                
                let fullConversation = "محتوى المحادثة:\n";
                if (messages) {
                    messages.forEach(m => {
                        const sender = m.is_bot_reply ? "البوت" : "العميل";
                        fullConversation += `[${sender}]: ${m.message_text}\n`;
                    });
                }

                // Get last ticket number
                const { data: lastTicket } = await supabase.from('tickets').select('ticket_number').order('ticket_number', { ascending: false }).limit(1).maybeSingle();
                const nextNumber = (lastTicket?.ticket_number || 0) + 1;

                const { data: ticket, error } = await supabase.from('tickets').insert([{
                    user_id: currentUser.id.includes('guest') ? null : currentUser.id,
                    title: 'تذكرة تلقائية من المحادثة',
                    description: fullConversation,
                    status: 'open',
                    chat_session_id: currentSessionId,
                    ticket_number: nextNumber
                }]).select().single();

                if (!error && ticket) {
                    currentTicketId = ticket.id;
                }
            }
        }
    }

    async function sendBotReply(text) {
        if (!typingIndicator) return;
        typingIndicator.style.display = 'block';
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        
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

    // 6. End Chat & Rating Logic
    if (endChatBtn) {
        endChatBtn.onclick = () => {
            if (ratingModal) ratingModal.style.display = 'flex';
        };
    }

    stars.forEach(star => {
        star.onclick = () => {
            selectedRating = parseInt(star.dataset.value);
            stars.forEach(s => {
                if (parseInt(s.dataset.value) <= selectedRating) {
                    s.classList.add('active');
                } else {
                    s.classList.remove('active');
                }
            });
        };
    });

    if (submitRatingBtn) {
        submitRatingBtn.onclick = async () => {
            if (selectedRating === 0) {
                alert('يرجى اختيار تقييم أولاً');
                return;
            }

            submitRatingBtn.disabled = true;
            submitRatingBtn.innerText = 'جاري الإرسال...';

            try {
                // 1. Close the chat session
                await supabase.from('chat_sessions').update({ status: 'closed' }).eq('id', currentSessionId);

                // 2. Update ticket with rating if exists
                if (currentTicketId) {
                    await supabase.from('tickets').update({
                        rating: selectedRating,
                        rating_comment: ratingComment.value,
                        status: 'resolved' // Mark as resolved when chat ends
                    }).eq('id', currentTicketId);
                } else {
                    // If no ticket was opened by keyword, open one now to save the rating and conversation
                    const { data: messages } = await supabase
                        .from('chat_messages')
                        .select('message_text, is_bot_reply')
                        .eq('session_id', currentSessionId)
                        .order('created_at', { ascending: true });
                    
                    let fullConversation = "محتوى المحادثة عند الإغلاق:\n";
                    if (messages) {
                        messages.forEach(m => {
                            const sender = m.is_bot_reply ? "البوت" : "العميل";
                            fullConversation += `[${sender}]: ${m.message_text}\n`;
                        });
                    }

                    const { data: lastTicket } = await supabase.from('tickets').select('ticket_number').order('ticket_number', { ascending: false }).limit(1).maybeSingle();
                    const nextNumber = (lastTicket?.ticket_number || 0) + 1;

                    await supabase.from('tickets').insert([{
                        user_id: currentUser.id.includes('guest') ? null : currentUser.id,
                        title: 'محادثة منتهية وتقييم',
                        description: fullConversation,
                        status: 'resolved',
                        chat_session_id: currentSessionId,
                        rating: selectedRating,
                        rating_comment: ratingComment.value,
                        ticket_number: nextNumber
                    }]);
                }

                alert('شكراً لتقييمك! تم إنهاء المحادثة.');
                window.location.href = '/customer-dashboard.html';
            } catch (err) {
                console.error('Error ending chat:', err);
                alert('حدث خطأ أثناء إنهاء المحادثة');
                submitRatingBtn.disabled = false;
                submitRatingBtn.innerText = 'إرسال التقييم';
            }
        };
    }

    // UI Events
    if (sendBtn) sendBtn.onclick = sendMessage;
    if (chatInput) {
        chatInput.onkeypress = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        };
    }
    
    if (closeChatBtn) {
        closeChatBtn.onclick = () => {
            if (isAdmin) {
                Object.values(views).forEach(v => {
                    if (v) v.classList.remove('active');
                });
                if (views['customer-chats']) views['customer-chats'].classList.add('active');
                
                menuItems.forEach(i => i.classList.remove('active'));
                const chatTarget = document.querySelector('[data-target="customer-chats"]');
                if (chatTarget) chatTarget.classList.add('active');
                
                isTestMode = false;
                loadAllSessions();
            }
        };
    }

    // Initialize
    await loadBotSettings();
    await initAuth();
});
