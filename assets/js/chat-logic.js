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
                            <span class="card-tag" style="background:${session.is_manual_mode ? '#fff3cd' : '#d1e7dd'}; color:${session.is_manual_mode ? '#856404' : '#0f5132'}; font-size: 0.6rem;">
                                ${session.is_manual_mode ? 'رد يدوي' : 'بوت نشط'}
                            </span>
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

                        <button class="view-chat-btn" style="width:100%; background:var(--primary-blue); color:white; border:none; padding:8px; border-radius:8px; cursor:pointer; font-size:0.85rem; font-weight:600; margin-top: auto;">
                            عرض المحادثة
                        </button>
                    `;

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
                // إذا كانت الجلسة جديدة أو تم تحديثها، نعيد تحميل القائمة لضمان الترتيب الصحيح
                loadAllSessions();
            })
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
                console.log("[Chat Logic] New message detected globally:", payload);
                // تحديث آخر رسالة في الكارت الخاص بالجلسة بدون إعادة تحميل الكل إذا أمكن
                const sessionId = payload.new.session_id;
                const card = document.getElementById(`session-${sessionId}`);
                if (card) {
                    const preview = card.querySelector('.last-message-preview');
                    if (preview) preview.innerText = payload.new.message_text;
                    // نقل الكارت للأعلى لأنه تم تحديثه
                    const grid = document.getElementById('sessionsGrid');
                    if (grid && grid.firstChild !== card) {
                        grid.insertBefore(card, grid.firstChild);
                    }
                } else {
                    // إذا لم يكن الكارت موجوداً (محادثة جديدة تماماً)، نحمل الكل
                    loadAllSessions();
                }
            })
            .subscribe((status) => {
                console.log('[Chat Logic] Admin realtime subscription status:', status);
            });
    }

    async function openAdminChat(sessionId, name, manualMode) {
        if (messageChannel) { supabase.removeChannel(messageChannel); messageChannel = null; }
        if (modeChannel) { supabase.removeChannel(modeChannel); modeChannel = null; }

        currentSessionId = sessionId;
        isManualMode = manualMode;
        isTestMode = false;
        
        if (chatHeaderName) chatHeaderName.innerText = name;
        updateAdminChatHeader();
        
        Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
        if (views['chat-window']) views['chat-window'].classList.add('active');
        
        loadMessages();
        subscribeToMessages();
        
        modeChannel = supabase.channel(`session-mode-${currentSessionId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_sessions', filter: `id=eq.${currentSessionId}` }, payload => {
                isManualMode = payload.new.is_manual_mode;
                updateAdminChatHeader();
                const toggleBtn = document.getElementById('manualModeToggle');
                if (toggleBtn) toggleBtn.innerText = isManualMode ? 'إيقاف الرد اليدوي' : 'تفعيل الرد اليدوي';
            }).subscribe();
            
        let toggleBtn = document.getElementById('manualModeToggle');
        if (!toggleBtn) {
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'manualModeToggle';
            toggleBtn.style = "margin-right:10px; padding:5px 15px; border-radius:20px; border:1px solid white; background:transparent; color:white; cursor:pointer; font-size:0.8rem;";
            const profileContainer = document.querySelector('.chat-header-blue .bot-profile');
            if (profileContainer) profileContainer.appendChild(toggleBtn);
        }
        if (toggleBtn) {
            toggleBtn.innerText = isManualMode ? 'إيقاف الرد اليدوي' : 'تفعيل الرد اليدوي';
            toggleBtn.onclick = async () => {
                const newMode = !isManualMode;
                const { error } = await supabase.from('chat_sessions').update({ is_manual_mode: newMode, updated_at: new Date() }).eq('id', currentSessionId);
                if (!error) {
                    isManualMode = newMode;
                    toggleBtn.innerText = isManualMode ? 'إيقاف الرد اليدوي' : 'تفعيل الرد اليدوي';
                    updateAdminChatHeader();
                }
            };
        }
    }

    function updateAdminChatHeader() {
        if (chatHeaderStatus) {
            chatHeaderStatus.innerText = isManualMode ? 'أنت تتحدث الآن مع العميل' : 'البوت يقوم بالرد تلقائياً';
            chatHeaderStatus.style.color = isManualMode ? '#ffcc00' : 'white';
        }
        if (chatHeaderImg) chatHeaderImg.src = isManualMode ? '/assets/images/technical-support.svg' : '/assets/images/mad3oom-robot.png';
    }

    async function loadMessages() {
        if (!currentSessionId || !chatMessages) return;
        try {
            const { data: messages, error } = await supabase.from('chat_messages').select('*').eq('session_id', currentSessionId).order('created_at', { ascending: true });
            if (error) throw error;
            chatMessages.innerHTML = '';
            if (messages) {
                messages.forEach(m => {
                    const isReceived = isAdmin ? (!m.is_admin_reply) : (m.is_bot_reply || m.is_admin_reply);
                    appendMessage(m.message_text, isReceived ? 'received' : 'sent', m.created_at, m.id);
                });
            }
        } catch (error) {
            console.error("Error loading messages:", error);
        }
    }

    function subscribeToMessages() {
        if (!currentSessionId) return;
        messageChannel = supabase.channel(`messages-${currentSessionId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${currentSessionId}` }, payload => {
                const m = payload.new;
                // التحقق مما إذا كانت الرسالة موجودة بالفعل لتجنب التكرار
                if (document.getElementById(`msg-${m.id}`)) return;

                const isReceived = isAdmin ? (!m.is_admin_reply) : (m.is_bot_reply || m.is_admin_reply);
                
                // إذا كانت الرسالة من الطرف الآخر أو من البوت، نضيفها
                // أما إذا كانت من نفس المستخدم الحالي، فقد تمت إضافتها بالفعل عند الإرسال (Optimistic UI)
                if (m.sender_id !== currentUser.id || m.is_bot_reply) {
                    appendMessage(m.message_text, isReceived ? 'received' : 'sent', m.created_at, m.id);
                }
            }).subscribe();
    }

    async function setupUserChat() {
        try {
            let sessionQuery = supabase.from('chat_sessions').select('id, is_manual_mode').eq('status', 'active');
            if (currentUser.isGuest) sessionQuery = sessionQuery.eq('guest_id', currentUser.id);
            else sessionQuery = sessionQuery.eq('user_id', currentUser.id);
            
            const { data: session } = await sessionQuery.maybeSingle();
            if (session) {
                currentSessionId = session.id;
                isManualMode = session.is_manual_mode;
            } else {
                const sessionData = { status: 'active' };
                if (currentUser.isGuest) sessionData.guest_id = currentUser.id;
                else sessionData.user_id = currentUser.id;
                const { data: newSession } = await supabase.from('chat_sessions').insert([sessionData]).select().single();
                if (newSession) currentSessionId = newSession.id;
            }
            loadMessages();
            subscribeToMessages();
        } catch (error) {
            console.error("Error setting up user chat:", error);
        }
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || !currentSessionId) return;
        chatInput.value = '';
        
        // Optimistic UI: إضافة الرسالة فوراً للواجهة
        const tempId = 'temp-' + Date.now();
        appendMessage(text, 'sent', new Date(), tempId);
        
        if (isTestMode) { handleBotLogic(text); return; }

        const msgData = { session_id: currentSessionId, message_text: text, sender_id: currentUser.id };
        if (isAdmin) msgData.is_admin_reply = true;

        try {
            const { data: savedMsg, error } = await supabase.from('chat_messages').insert([msgData]).select().single();
            if (error) throw error;
            
            // تحديث الـ ID المؤقت بالـ ID الحقيقي من قاعدة البيانات
            const tempMsg = document.getElementById(`msg-${tempId}`);
            if (tempMsg && savedMsg) tempMsg.id = `msg-${savedMsg.id}`;

            await supabase.from('chat_sessions').update({ updated_at: new Date() }).eq('id', currentSessionId);

            // إرسال إشعار عند إرسال رسالة جديدة
            if (!isAdmin) {
                // رسالة من عميل -> إشعار للأدمن
                const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
                if (admins) {
                    for (const admin of admins) {
                        await supabase.from('notifications').insert({
                            user_id: admin.id,
                            title: 'رسالة جديدة من عميل',
                            message: `لديك رسالة جديدة في المحادثة المباشرة: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`,
                            type: 'chat',
                            link: 'chat-admin.html'
                        });
                    }
                }
            } else {
                // رسالة من أدمن -> إشعار للعميل (إذا كان مسجل دخول)
                const { data: session } = await supabase.from('chat_sessions').select('user_id').eq('id', currentSessionId).single();
                if (session && session.user_id) {
                    await supabase.from('notifications').insert({
                        user_id: session.user_id,
                        title: 'رد جديد من الدعم',
                        message: `لديك رد جديد في المحادثة المباشرة: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`,
                        type: 'chat',
                        link: 'chat-customer.html'
                    });
                }

                // --- آلية الذاكرة الذكية ---
                // إذا كان الرد يدوي والذاكرة الذكية مفعلة، نقوم بحفظ الرسالة والرد في جدول الذاكرة
                if (isManualMode && botSettings?.smart_memory_enabled) {
                    try {
                        // جلب آخر رسالة من العميل في هذه الجلسة
                        const { data: lastUserMsg } = await supabase
                            .from('chat_messages')
                            .select('message_text')
                            .eq('session_id', currentSessionId)
                            .eq('is_admin_reply', false)
                            .eq('is_bot_reply', false)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        if (lastUserMsg) {
                            await supabase.from('chatbot_memory').insert({
                                conversation_id: currentSessionId,
                                user_message: lastUserMsg.message_text,
                                admin_reply: text
                            });
                        }
                    } catch (memErr) {
                        console.error("Error saving to smart memory:", memErr);
                    }
                }
            }

            if (!isAdmin && !isManualMode) handleBotLogic(text);
        } catch (error) {
            console.error("Error sending message:", error);
            // في حالة الخطأ، يمكن إظهار علامة خطأ بجانب الرسالة
            const tempMsg = document.getElementById(`msg-${tempId}`);
            if (tempMsg) tempMsg.style.opacity = '0.5';
        }
    }

    function appendMessage(text, type, time, id) {
        if (!chatMessages) return;
        
        // منع التكرار إذا كانت الرسالة موجودة بالفعل
        if (id && document.getElementById(`msg-${id}`)) return;

        const div = document.createElement('div');
        div.className = `msg ${type}`;
        if (id) div.id = `msg-${id}`;
        div.innerText = text;
        
        const timeSpan = document.createElement('div');
        timeSpan.style = "font-size:0.65rem; opacity:0.6; margin-top:4px; text-align:" + (type === 'sent' ? 'left' : 'right');
        timeSpan.innerText = new Date(time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        
        div.appendChild(timeSpan);
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function handleBotLogic(text) {
        if (!botSettings?.bot_enabled && !isTestMode) return;
        if (!typingIndicator) return;
        
        typingIndicator.style.display = 'block';
        setTimeout(async () => {
            typingIndicator.style.display = 'none';
            let reply = "عذراً، لم أفهم طلبك جيداً. هل يمكنك التوضيح؟";
            
            // 1. البحث في الذاكرة الذكية أولاً (Long-term memory)
            if (botSettings?.smart_memory_enabled) {
                try {
                    // البحث عن رسائل مشابهة في الذاكرة
                    const { data: memoryMatches } = await supabase
                        .from('chatbot_memory')
                        .select('admin_reply')
                        .ilike('user_message', `%${text}%`)
                        .limit(1)
                        .maybeSingle();
                    
                    if (memoryMatches) {
                        reply = memoryMatches.admin_reply;
                    } else if (botSettings?.custom_replies) {
                        // 2. إذا لم يوجد في الذاكرة، نستخدم الردود المخصصة التقليدية
                        const matched = botSettings.custom_replies.find(r => text.includes(r.keyword));
                        if (matched) reply = matched.reply;
                    }
                } catch (err) {
                    console.error("Error searching smart memory:", err);
                }
            } else if (botSettings?.custom_replies) {
                // إذا كانت الذاكرة معطلة، نستخدم الردود المخصصة فقط
                const matched = botSettings.custom_replies.find(r => text.includes(r.keyword));
                if (matched) reply = matched.reply;
            }
            
            if (isTestMode) {
                appendMessage(reply, 'received', new Date());
            } else {
                // في الوضع الحقيقي، الـ Realtime سيتكفل بإضافة الرسالة للواجهة عند حفظها في القاعدة
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
