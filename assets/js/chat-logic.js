import { supabase, supabaseRestFetch } from '../../api-config.js';

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
    let hasChatbotMemoryTable = null;

    function logRlsFailure(tableName, error, context = '') {
        const details = {
            context,
            table: tableName,
            code: error?.code || 'unknown',
            hint: error?.hint || 'none',
            message: error?.message || 'unknown error'
        };

        if (error?.code === '42501') {
            console.error('[Bot] RLS blocked', details);
            return;
        }

        console.error('[Supabase][RLS/Query Failure]', details);
    }

    async function fetchGeminiReply(message, systemInstruction) {
        if (!supabase) {
            throw new Error('Supabase client not initialized');
        }

        const payload = {
            message: `التعليمات: ${systemInstruction}\n\nرسالة العميل: ${message}`
        };

        const { data, error } = await supabase.functions.invoke('gemini-proxy', {
            body: payload
        });

        if (error) {
            throw new Error(error.message || 'gemini-proxy invocation failed');
        }

        const reply = data?.reply?.trim();
        if (!reply) {
            throw new Error('gemini-proxy returned an empty reply');
        }

        return reply;
    }

    async function getSmartMemoryReply(text) {
        if (hasChatbotMemoryTable === false) return null;

        const { data: memories, error } = await supabase
            .from('chatbot_memory')
            .select('reply_text')
            .textSearch('keyword', text)
            .limit(1);

        if (error) {
            if (error.code === 'PGRST205') {
                hasChatbotMemoryTable = false;
                logRlsFailure('chatbot_memory', error, 'table-check');
                return null;
            }

            logRlsFailure('chatbot_memory', error, 'getSmartMemoryReply');
            return null;
        }

        hasChatbotMemoryTable = true;
        return memories && memories.length > 0 ? memories[0].reply_text : null;
    }

    async function testSupabaseConnection() {
        const report = {
            timestamp: new Date().toISOString(),
            checks: {
                memory: null,
                gemini: null
            }
        };

        try {
            const { data, error } = await supabase.from('chatbot_memory').select('*').limit(1);
            if (error) {
                logRlsFailure('chatbot_memory', error, 'testSupabaseConnection');
                report.checks.memory = { ok: false, code: error.code || 'unknown', hint: error.hint || null };
            } else {
                report.checks.memory = { ok: true, rows: data?.length || 0 };
            }
        } catch (error) {
            report.checks.memory = { ok: false, message: error?.message || 'unknown' };
        }

        report.checks.gemini = { ok: true, reason: 'proxied_via_edge_function' };

        try {
            const restResponse = await supabaseRestFetch('chatbot_memory?select=id&limit=1', { method: 'GET' });
            report.checks.rest = {
                ok: restResponse.ok,
                status: restResponse.status
            };
            if (!restResponse.ok) {
                console.warn('[Supabase][Debug] REST check failed for chatbot_memory', {
                    status: restResponse.status
                });
            }
        } catch (error) {
            report.checks.rest = { ok: false, message: error?.message || 'unknown' };
        }

        console.log('[Supabase][Debug] Connection report', report);
        return report;
    }

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
                            const { error } = await supabase.from('chat_sessions').update({ status: 'closed' }).eq('id', session.id);
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

    async function setupUserChat() {
        try {
            // البحث عن جلسة نشطة للمستخدم أو الضيف
            let query = supabase.from('chat_sessions').select('id, is_manual_mode').eq('status', 'active');
            
            if (currentUser.isGuest) {
                query = query.eq('guest_id', currentUser.id);
            } else {
                query = query.eq('user_id', currentUser.id);
            }
            
            const { data: sessions, error } = await query;
            
            if (error) throw error;
            
            if (sessions && sessions.length > 0) {
                currentSessionId = sessions[0].id;
                isManualMode = sessions[0].is_manual_mode;
                loadMessages(currentSessionId);
                subscribeToMessages(currentSessionId);
            } else {
                // إنشاء جلسة جديدة
                const newSession = {
                    status: 'active',
                    is_manual_mode: false
                };
                
                if (currentUser.isGuest) {
                    newSession.guest_id = currentUser.id;
                    newSession.user_id = 'guest';
                } else {
                    newSession.user_id = currentUser.id;
                }
                
                const { data: created, error: createErr } = await supabase
                    .from('chat_sessions')
                    .insert([newSession])
                    .select()
                    .single();
                    
                if (createErr) throw createErr;
                
                currentSessionId = created.id;
                isManualMode = created.is_manual_mode;
                
                // إرسال رسالة الترحيب
                if (botSettings && botSettings.bot_enabled && botSettings.welcome_message) {
                    await supabase.from('chat_messages').insert([{
                        session_id: currentSessionId,
                        message_text: botSettings.welcome_message,
                        is_bot_reply: true,
                        sender_id: null
                    }]);
                }
                
                loadMessages(currentSessionId);
                subscribeToMessages(currentSessionId);
            }
        } catch (err) {
            console.error("Error setting up user chat:", err);
        }
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
                if (messages && messages.length > 0) {
                    messages.forEach(msg => {
                        const type = (msg.is_bot_reply || msg.is_admin_reply) ? 'received' : 'sent';
                        appendMessage(msg.message_text, type, msg.created_at);
                    });
                } else {
                    // إذا لم تكن هناك رسائل، نعرض رسالة الترحيب من الإعدادات
                    if (botSettings && botSettings.welcome_message) {
                        appendMessage(botSettings.welcome_message, 'received', new Date());
                    }
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
                // إذا كان المستخدم هو من أرسل الرسالة، لا نكررها (لأنها أضيفت بالفعل عبر appendMessage في sendMessage)
                // ولكن في حالة الاستقبال من البوت أو الأدمن، يجب إضافتها
                const isFromMe = msg.sender_id === currentUser.id;
                if (!isFromMe) {
                    const type = (msg.is_bot_reply || msg.is_admin_reply) ? 'received' : 'sent';
                    appendMessage(msg.message_text, type, msg.created_at);
                }
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

        // إضافة الرسالة للواجهة فوراً لتجربة مستخدم أفضل
        appendMessage(text, 'sent', new Date());

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

    function isBotEnabled(settings) {
        if (!settings) return true;
        if (typeof settings.bot_enabled === 'boolean') return settings.bot_enabled;
        if (typeof settings.is_enabled === 'boolean') return settings.is_enabled;
        return true;
    }
async function fetchGeminiReply(message) {
    try {
        const { data, error } = await supabase.functions.invoke('gemini-proxy', {
            body: { message }
        });

        if (error) {
            console.error('[Bot] Edge Function Error:', error);
            return null;
        }

        // Gemini الرد بيكون جواه text هنا:
        const text =
            data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

        return text;

    } catch (err) {
        console.error('[Bot] invoke failed:', err);
        return null;
    }
}

    async function handleBotReply(text) {
        console.log("[Bot] Handling reply for:", text);
        if (!isBotEnabled(botSettings)) {
            console.log("[Bot] Bot is disabled or settings not loaded");
            return;
        }
        
        if (typingIndicator) typingIndicator.style.display = 'block';
        if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            let reply = "";

            // 1. محاولة استخدام الذاكرة المحلية أولاً
            if (botSettings?.smart_memory_enabled) {
                try {
                    reply = await getSmartMemoryReply(text);
                    if (reply) {
                        console.log('[Bot] Reply resolved from chatbot_memory');
                    }
                } catch (err) {
                    console.error('[Bot] Error searching chatbot_memory:', err);
                }
            }

            // 2. إذا لا يوجد رد من الذاكرة نحاول Gemini عبر Edge Function
            if (!reply) {
               console.log("[Bot] Attempting Gemini via Edge Function...");

const geminiReply = await fetchGeminiReply(text);

if (geminiReply) {
    reply = geminiReply;
    console.log("[Bot] Gemini reply received");
}


            // 4. إذا فشل Gemini نستخدم الردود المخصصة
            if (!reply && botSettings?.custom_replies) {
                const matched = botSettings.custom_replies.find(r => text.includes(r.keyword));
                if (matched) reply = matched.reply;
            }

            // 4. رد افتراضي إذا لم يتوفر أي شيء
            if (!reply) {
                reply = "عذراً، لم أفهم طلبك. هل يمكنك التوضيح أكثر؟";
            }

            // إخفاء مؤشر الكتابة وإرسال الرد
            if (typingIndicator) typingIndicator.style.display = 'none';
            
            if (isTestMode) {
                appendMessage(reply, 'received', new Date());
            } else {
                console.log("[Bot] Saving bot reply to database...");
                const { error: insertError } = await supabase.from('chat_messages').insert([{ 
                    session_id: currentSessionId, 
                    message_text: reply, 
                    is_bot_reply: true,
                    sender_id: null
                }]);
                
                if (insertError) {
                    console.error("[Bot] Error saving reply:", insertError);
                    // في حالة فشل الحفظ في القاعدة، نظهر الرسالة في الواجهة على الأقل
                    appendMessage(reply, 'received', new Date());
                }
            }
        } catch (error) {
            console.error("[Bot] Fatal error in handleBotReply:", error);
            if (typingIndicator) typingIndicator.style.display = 'none';
            appendMessage("عذراً، حدث خطأ تقني. يرجى المحاولة لاحقاً.", 'received', new Date());
        }
    }

    async function loadBotSettings() {
        try {
            const { data } = await supabase.from('bot_settings').select('*').limit(1).maybeSingle();
            botSettings = data || {
                bot_enabled: true,
                smart_memory_enabled: false,
                custom_replies: []
            };
        } catch (error) {
            console.error("Error loading bot settings:", error);
            botSettings = {
                bot_enabled: true,
                smart_memory_enabled: false,
                custom_replies: []
            };
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

    await testSupabaseConnection();
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
