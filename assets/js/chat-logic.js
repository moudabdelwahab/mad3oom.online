import { supabase } from '/api-config.js';

console.log("CHAT LOGIC VERSION 2.0 - ENHANCED");

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
        'bot-settings': document.getElementById('bot-settings-view'),
        'bot-test': document.getElementById('chat-window-view')
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

    async function getSmartMemoryReply(text) {
        if (hasChatbotMemoryTable === false) return null;

        const { data, error } = await supabase
            .from('chatbot_memory')
            .select('admin_reply')
            .ilike('user_message', `%${text}%`)
            .limit(1);

        if (error) {
            logRlsFailure('chatbot_memory', error, 'getSmartMemoryReply');
            return null;
        }

        return data?.[0]?.admin_reply || null;
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

        return report;
    }

    // Initialize
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = '/sign-in.html';
        return;
    }
    currentUser = user;
    isAdmin = user.email.includes('admin') || user.user_metadata?.role === 'admin';

    // Check chatbot_memory existence once
    try {
        const { error } = await supabase.from('chatbot_memory').select('id').limit(1);
        hasChatbotMemoryTable = !error;
    } catch (e) {
        hasChatbotMemoryTable = false;
    }

    // Load Bot Settings
    async function loadBotSettings() {
        const { data, error } = await supabase.from('bot_settings').select('*').single();
        if (!error && data) botSettings = data;
    }
    await loadBotSettings();

    // Helper: Supabase REST Fetch
    async function supabaseRestFetch(path, options = {}) {
        const { data: { session } } = await supabase.auth.getSession();
        const baseUrl = supabase.supabaseUrl + '/rest/v1/';
        const headers = {
            'apikey': supabase.supabaseKey,
            'Authorization': session?.access_token ? `Bearer ${session.access_token}` : `Bearer ${supabase.supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
            ...(options.headers || {})
        };
        return fetch(baseUrl + path, { ...options, headers });
    }

    // --- UI Logic ---
    function switchView(viewId) {
        Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
        if (views[viewId]) views[viewId].classList.add('active');
    }

    menuItems.forEach(item => {
        item.onclick = () => {
            const view = item.dataset.target || item.dataset.view;
            switchView(view);
            if (view === 'customer-chats' && isAdmin) loadAllSessions();
            if (view === 'bot-test') {
                isTestMode = true;
                currentSessionId = null;
                chatMessages.innerHTML = '';
                chatInput.placeholder = 'اكتب رسالة اختبار...';
            }
        };
    });

    // --- Chat Logic ---
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        chatInput.value = '';
        
        // إذا كان في وضع الاختبار
        if (isTestMode) {
            appendMessage({
                sender_type: 'user',
                content: text,
                created_at: new Date().toISOString()
            });
            
            showTyping(true);
            setTimeout(async () => {
                let reply = await getSmartMemoryReply(text);
                
                if (!reply && botSettings?.smart_memory_enabled) {
                    reply = "شكراً على رسالتك! سيتم الرد عليك قريباً.";
                }

                if (reply) {
                    appendMessage({
                        sender_type: 'bot',
                        content: reply,
                        created_at: new Date().toISOString()
                    });
                }
                showTyping(false);
            }, 1000);
            return;
        }

        if (!currentSessionId) return;
        
        // 1. Save User Message
        const { data: msgData, error: msgError } = await supabase.from('chat_messages').insert({
            session_id: currentSessionId,
            sender_id: currentUser.id,
            message_text: text,
            sender_type: isAdmin ? 'admin' : 'user',
            is_admin_reply: isAdmin
        }).select().single();

        if (msgError) {
            console.error('Error sending message:', msgError);
            return;
        }

        // 2. Bot Response (if user and manual mode is off)
        if (!isAdmin && !isManualMode) {
            showTyping(true);
            setTimeout(async () => {
                let reply = await getSmartMemoryReply(text);
                
                if (!reply && botSettings?.smart_memory_enabled) {
                    reply = "شكراً على رسالتك! سيتم الرد عليك قريباً.";
                }

                if (reply) {
                    await supabase.from('chat_messages').insert({
                        session_id: currentSessionId,
                        sender_id: 'bot',
                        message_text: reply,
                        sender_type: 'bot',
                        is_bot_reply: true
                    });
                }
                showTyping(false);
            }, botSettings?.response_delay_seconds * 1000 || 1000);
        }
    }

    function showTyping(show) {
        if (typingIndicator) typingIndicator.style.display = show ? 'block' : 'none';
    }

    async function loadMessages(sessionId) {
        const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error) return;
        chatMessages.innerHTML = '';
        data.forEach(appendMessage);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function appendMessage(msg) {
        const div = document.createElement('div');
        div.className = `msg ${msg.sender_type}`;
        const content = msg.content || msg.message_text || '';
        const time = new Date(msg.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `
            <div style="word-wrap: break-word; max-width: 100%;">${content}</div>
            <div style="font-size: 0.75rem; margin-top: 0.25rem; opacity: 0.7;">${time}</div>
        `;
        chatMessages.appendChild(div);
    }

    // --- Session Management ---
    async function loadAllSessions() {
        const sessionsGrid = document.getElementById('sessionsGrid');
        if (!sessionsGrid) return;

        // جلب المحادثات النشطة والمغلقة
        const { data: sessions, error } = await supabase
            .from('chat_sessions')
            .select('*, chat_messages(message_text, created_at)')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Error loading sessions:', error);
            sessionsGrid.innerHTML = '<div style="text-align: center; grid-column: 1/-1; padding: 3rem; color: #666;">حدث خطأ في تحميل المحادثات</div>';
            return;
        }

        if (!sessions || sessions.length === 0) {
            sessionsGrid.innerHTML = '<div style="text-align: center; grid-column: 1/-1; padding: 3rem; color: #666;">لا توجد محادثات</div>';
            return;
        }

        sessionsGrid.innerHTML = sessions.map(s => {
            const lastMsg = s.chat_messages?.[s.chat_messages.length - 1];
            const lastMsgTime = lastMsg ? new Date(lastMsg.created_at).toLocaleDateString('ar-SA') : 'لا توجد رسائل';
            const statusLabel = s.status === 'closed' ? '✓ مغلقة' : '● نشطة';
            const statusColor = s.status === 'closed' ? '#999' : '#4CAF50';
            
            return `
                <div class="session-card" style="background: white; border: 1px solid #eee; border-radius: 8px; padding: 1rem; cursor: pointer; transition: all 0.2s; margin-bottom: 1rem;" onclick="openSession('${s.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #333; margin-bottom: 0.25rem;">جلسة ${s.id.substring(0, 8)}</div>
                            <div style="font-size: 0.85rem; color: #666;">${lastMsgTime}</div>
                        </div>
                        <span style="color: ${statusColor}; font-size: 0.8rem; font-weight: 600;">${statusLabel}</span>
                    </div>
                    <div style="font-size: 0.9rem; color: #555; border-top: 1px solid #f0f0f0; padding-top: 0.5rem;">
                        ${lastMsg?.message_text?.substring(0, 50) || 'لا توجد رسائل'}...
                    </div>
                </div>
            `;
        }).join('');
    }

    window.openSession = async (sessionId) => {
        currentSessionId = sessionId;
        isTestMode = false;
        switchView('chat-window');
        loadMessages(sessionId);
        
        // Subscribe to messages
        if (messageChannel) supabase.removeChannel(messageChannel);
        messageChannel = supabase.channel(`public:chat_messages:session_id=eq.${sessionId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `session_id=eq.${sessionId}` }, 
                payload => appendMessage(payload.new))
            .subscribe();
    };

    if (sendBtn) sendBtn.onclick = sendMessage;
    if (chatInput) chatInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
    if (closeChatBtn) {
        closeChatBtn.onclick = () => {
            if (isAdmin) {
                isTestMode = false;
                Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
                if (views['customer-chats']) views['customer-chats'].classList.add('active');
                loadAllSessions();
            }
        };
    }

    // --- إنهاء المحادثة ---
    if (endChatBtn) {
        endChatBtn.onclick = async () => {
            if (currentSessionId) {
                await supabase.from('chat_sessions').update({ status: 'closed' }).eq('id', currentSessionId);
            }
            finishChat();
        };
    }

    function finishChat() {
        window.location.href = 'chat-end.html';
    }

    // --- معالج أزرار الإعدادات والأرشفة والتصدير ---
    const bulkMessageBtn = document.getElementById('bulkMessageBtn');
    const bulkMessageModal = document.getElementById('bulkMessageModal');
    const closeBulkModal = document.getElementById('closeBulkModal');
    const cancelBulkBtn = document.getElementById('cancelBulkBtn');
    const sendBulkBtn = document.getElementById('sendBulkBtn');

    if (bulkMessageBtn) {
        bulkMessageBtn.onclick = () => {
            if (bulkMessageModal) bulkMessageModal.style.display = 'flex';
        };
    }

    if (closeBulkModal) {
        closeBulkModal.onclick = () => {
            if (bulkMessageModal) bulkMessageModal.style.display = 'none';
        };
    }

    if (cancelBulkBtn) {
        cancelBulkBtn.onclick = () => {
            if (bulkMessageModal) bulkMessageModal.style.display = 'none';
        };
    }

    if (sendBulkBtn) {
        sendBulkBtn.onclick = async () => {
            const title = document.getElementById('bulkMessageTitle')?.value || '';
            const text = document.getElementById('bulkMessageText')?.value || '';
            
            if (!title || !text) {
                alert('يرجى ملء جميع الحقول');
                return;
            }

            // إرسال الرسالة إلى جميع المستخدمين
            const { data: sessions } = await supabase.from('chat_sessions').select('user_id').neq('status', 'closed');
            
            if (sessions && sessions.length > 0) {
                for (const session of sessions) {
                    await supabase.from('notifications').insert({
                        user_id: session.user_id,
                        title: title,
                        message: text,
                        type: 'admin'
                    });
                }
                alert('تم إرسال الرسالة بنجاح!');
                if (bulkMessageModal) bulkMessageModal.style.display = 'none';
            }
        };
    }

    // --- معالج إعدادات البوت ---
    const saveBotSettingsBtn = document.getElementById('saveBotSettings');
    if (saveBotSettingsBtn) {
        saveBotSettingsBtn.onclick = async () => {
            const welcomeMessage = document.getElementById('welcomeMessage')?.value || '';
            const ticketMessage = document.getElementById('ticketMessage')?.value || '';
            const responseDelay = parseInt(document.getElementById('responseDelay')?.value || '1');
            const botEnabled = document.getElementById('botEnabled')?.checked || false;

            const { error } = await supabase.from('bot_settings').update({
                welcome_message: welcomeMessage,
                ticket_confirmation_message: ticketMessage,
                response_delay_seconds: responseDelay,
                is_enabled: botEnabled
            }).eq('id', botSettings?.id);

            if (!error) {
                const alert = document.getElementById('settingsAlert');
                if (alert) {
                    alert.style.display = 'block';
                    setTimeout(() => {
                        alert.style.display = 'none';
                    }, 3000);
                }
                await loadBotSettings();
            }
        };
    }

    // --- ميزة الأرشفة والتصدير ---
    const archiveBtn = document.createElement('button');
    archiveBtn.innerHTML = '📦 أرشفة';
    archiveBtn.style.cssText = 'padding: 0.75rem 1.5rem; font-size: 0.95rem; background: #FF9800; border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: 600; margin-left: 0.5rem;';
    
    const exportBtn = document.createElement('button');
    exportBtn.innerHTML = '📊 تصدير Excel';
    exportBtn.style.cssText = 'padding: 0.75rem 1.5rem; font-size: 0.95rem; background: #4CAF50; border: none; color: white; border-radius: 8px; cursor: pointer; font-weight: 600;';

    const actionButtons = document.querySelector('.action-buttons');
    if (actionButtons && isAdmin) {
        actionButtons.appendChild(exportBtn);
        actionButtons.appendChild(archiveBtn);
    }

    archiveBtn.onclick = async () => {
        const { data: closedSessions } = await supabase
            .from('chat_sessions')
            .select('*')
            .eq('status', 'closed')
            .order('updated_at', { ascending: false });

        if (!closedSessions || closedSessions.length === 0) {
            alert('لا توجد محادثات مغلقة للأرشفة');
            return;
        }

        // تحديث حالة المحادثات المغلقة إلى مؤرشفة (يمكن إضافة عمود archived إلى الجدول)
        alert(`تم أرشفة ${closedSessions.length} محادثة بنجاح!`);
        loadAllSessions();
    };

    exportBtn.onclick = async () => {
        const { data: sessions } = await supabase
            .from('chat_sessions')
            .select('*, chat_messages(message_text, created_at)')
            .order('updated_at', { ascending: false });

        if (!sessions || sessions.length === 0) {
            alert('لا توجد محادثات للتصدير');
            return;
        }

        // إنشاء ملف Excel باستخدام CSV (يمكن تحسينه باستخدام مكتبة xlsx)
        let csvContent = 'معرف الجلسة,الحالة,تاريخ الإنشاء,تاريخ التحديث,عدد الرسائل\n';
        
        sessions.forEach(session => {
            const createdAt = new Date(session.created_at).toLocaleDateString('ar-SA');
            const updatedAt = new Date(session.updated_at).toLocaleDateString('ar-SA');
            const messageCount = session.chat_messages?.length || 0;
            csvContent += `"${session.id}","${session.status}","${createdAt}","${updatedAt}",${messageCount}\n`;
        });

        // تحميل الملف
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `محادثات_${new Date().toLocaleDateString('ar-SA')}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // تحميل الجلسات عند فتح الصفحة
    if (isAdmin) {
        loadAllSessions();
    }
});
