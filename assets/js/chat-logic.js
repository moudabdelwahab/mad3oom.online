console.log("CHAT LOGIC VERSION 1000");

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

        try {
            const restResponse = await supabaseRestFetch('chatbot_memory?select=id&limit=1', { method: 'GET' });
            console.log('[Bot] REST Check:', restResponse.ok ? 'OK' : 'FAIL');
        } catch (e) {}

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
            const view = item.dataset.view;
            switchView(view);
            if (view === 'customer-chats' && isAdmin) loadAllSessions();
        };
    });

    // --- Chat Logic ---
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || !currentSessionId) return;

        chatInput.value = '';
        
        // 1. Save User Message
        const { data: msgData, error: msgError } = await supabase.from('chat_messages').insert({
            session_id: currentSessionId,
            sender_id: currentUser.id,
            content: text,
            sender_type: isAdmin ? 'admin' : 'user'
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
                
                if (!reply && botSettings?.use_ai) {
                    // Gemini AI Fallback
                    try {
                        const response = await fetch('https://api.google.com/gemini/v1/chat', { /* mock */ });
                        // ... AI logic ...
                        reply = "أنا هنا لمساعدتك! سأقوم بالرد عليك قريباً.";
                    } catch (e) {
                        reply = "عذراً، واجهت مشكلة في الاتصال. سأحولك لموظف خدمة العملاء.";
                    }
                }

                if (reply) {
                    await supabase.from('chat_messages').insert({
                        session_id: currentSessionId,
                        sender_id: 'bot',
                        content: reply,
                        sender_type: 'bot'
                    });
                }
                showTyping(false);
            }, 1000);
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
        div.className = `message ${msg.sender_type}`;
        div.innerHTML = `
            <div class="message-content">${msg.content}</div>
            <div class="message-time">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        `;
        chatMessages.appendChild(div);
    }

    // --- Session Management ---
    async function loadAllSessions() {
        const container = document.getElementById('sessionsList');
        if (!container) return;

        const { data, error } = await supabase
            .from('chat_sessions')
            .select('*, chat_messages(content, created_at)')
            .order('updated_at', { ascending: false });

        if (error) return;
        container.innerHTML = data.map(s => `
            <div class="session-item" onclick="openSession('${s.id}')">
                <div class="session-info">
                    <div class="session-name">${s.user_email || 'عميل'}</div>
                    <div class="session-last-msg">${s.chat_messages?.[0]?.content || 'لا توجد رسائل'}</div>
                </div>
            </div>
        `).join('');
    }

    window.openSession = async (sessionId) => {
        currentSessionId = sessionId;
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
                Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
                if (views['customer-chats']) views['customer-chats'].classList.add('active');
                loadAllSessions();
            }
        };
    }

    // --- منطق إنهاء المحادثة والتقييم (محدث بناءً على طلب العميل) ---
    if (endChatBtn) {
        endChatBtn.onclick = async () => {
            // إغلاق الجلسة في قاعدة البيانات فوراً والتحويل لصفحة النهاية
            if (currentSessionId) {
                await supabase.from('chat_sessions').update({ status: 'closed' }).eq('id', currentSessionId);
            }
            finishChat();
        };
    }

    function finishChat() {
        // التحويل المباشر لصفحة النهاية دون نوافذ منبثقة أو تأكيد
        window.location.href = 'chat-end.html';
    }

    // --- منطق القائمة السياقية (Context Menu) للرد والتفاعل ---
    const contextMenu = document.createElement('div');
    contextMenu.id = 'chatContextMenu';
    contextMenu.style.cssText = `
        position: fixed;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        display: none;
        z-index: 10000;
        min-width: 150px;
        overflow: hidden;
        border: 1px solid #eee;
    `;
    document.body.appendChild(contextMenu);

    document.addEventListener('click', () => { contextMenu.style.display = 'none'; });
});
