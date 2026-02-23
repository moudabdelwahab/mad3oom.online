import { supabase } from '/api-config.js';

console.log("CHAT LOGIC VERSION 3.0 - WHATSAPP STYLE");

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const chatsList = document.getElementById('chatsList');
    const chatMain = document.getElementById('chatMain');
    const emptyState = document.getElementById('emptyState');
    const chatHeader = document.getElementById('chatHeader');
    const messagesContainer = document.getElementById('messagesContainer');
    const inputArea = document.getElementById('inputArea');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const searchInput = document.getElementById('searchInput');
    const closeChat = document.getElementById('closeChat');
    
    // Modal Elements
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsModal = document.getElementById('closeSettingsModal');
    const saveSettings = document.getElementById('saveSettings');
    const cancelSettings = document.getElementById('cancelSettings');
    
    const exportModal = document.getElementById('exportModal');
    const exportExcel = document.getElementById('exportExcel');
    const archiveChats = document.getElementById('archiveChats');
    const closeExportModal = document.getElementById('closeExportModal');
    const cancelExport = document.getElementById('cancelExport');

    // State
    let currentUser = null;
    let isAdmin = false;
    let currentSessionId = null;
    let currentSession = null;
    let messageChannel = null;
    let botSettings = null;
    let allSessions = [];

    // ===== INITIALIZATION =====
    async function init() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            window.location.href = '/sign-in.html';
            return;
        }
        
        currentUser = user;
        isAdmin = user.email.includes('admin') || user.user_metadata?.role === 'admin';

        if (!isAdmin) {
            window.location.href = '/customer-dashboard.html';
            return;
        }

        await loadBotSettings();
        await loadAllChats();
        setupEventListeners();
    }

    // ===== LOAD BOT SETTINGS =====
    async function loadBotSettings() {
        const { data, error } = await supabase.from('bot_settings').select('*').single();
        if (!error && data) {
            botSettings = data;
        }
    }

    // ===== LOAD ALL CHATS =====
    async function loadAllChats() {
        const { data: sessions, error } = await supabase
            .from('chat_sessions')
            .select('*, chat_messages(message_text, created_at, sender_id)')
            .order('updated_at', { ascending: false });

        if (error) {
            console.error('Error loading chats:', error);
            return;
        }

        allSessions = sessions || [];
        renderChatsList(allSessions);
    }

    // ===== RENDER CHATS LIST =====
    function renderChatsList(sessions) {
        if (!sessions || sessions.length === 0) {
            chatsList.innerHTML = '<div style="padding: 2rem 1rem; text-align: center; color: var(--text-light);">لا توجد محادثات</div>';
            return;
        }

        chatsList.innerHTML = sessions.map(session => {
            const lastMsg = session.chat_messages?.[session.chat_messages.length - 1];
            const lastMsgText = lastMsg?.message_text?.substring(0, 50) || 'لا توجد رسائل';
            const lastMsgTime = lastMsg ? formatTime(new Date(lastMsg.created_at)) : '';
            const initials = session.user_id?.substring(0, 2).toUpperCase() || 'ع';
            const statusIcon = session.status === 'closed' ? '✓' : '●';
            const statusColor = session.status === 'closed' ? '#999' : '#25D366';

            return `
                <div class="chat-item" onclick="selectChat('${session.id}')">
                    <div class="chat-avatar" style="position: relative;">
                        ${initials}
                        <span style="position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; background: ${statusColor}; border-radius: 50%; border: 2px solid white;"></span>
                    </div>
                    <div class="chat-info">
                        <div class="chat-header-text">
                            <span class="chat-name">جلسة ${session.id.substring(0, 8)}</span>
                            <span class="chat-time">${lastMsgTime}</span>
                        </div>
                        <div class="chat-preview">${lastMsgText}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ===== SELECT CHAT =====
    window.selectChat = async (sessionId) => {
        currentSessionId = sessionId;
        currentSession = allSessions.find(s => s.id === sessionId);

        if (!currentSession) return;

        // Update UI
        document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
        event.currentTarget?.classList.add('active');

        emptyState.style.display = 'none';
        chatHeader.style.display = 'flex';
        inputArea.style.display = 'flex';

        // Update header
        document.getElementById('headerName').textContent = `جلسة ${sessionId.substring(0, 8)}`;
        document.getElementById('headerStatus').textContent = currentSession.status === 'closed' ? 'مغلقة' : 'نشطة';
        document.getElementById('headerAvatar').textContent = sessionId.substring(0, 2).toUpperCase();

        // Load messages
        await loadMessages(sessionId);

        // Subscribe to new messages
        if (messageChannel) supabase.removeChannel(messageChannel);
        messageChannel = supabase.channel(`chat:${sessionId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `session_id=eq.${sessionId}`
            }, payload => {
                appendMessage(payload.new);
            })
            .subscribe();
    };

    // ===== LOAD MESSAGES =====
    async function loadMessages(sessionId) {
        const { data: messages, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error loading messages:', error);
            return;
        }

        messagesContainer.innerHTML = '';
        (messages || []).forEach(msg => appendMessage(msg));
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // ===== APPEND MESSAGE =====
    function appendMessage(msg) {
        const isOwn = msg.sender_id === currentUser.id || msg.is_admin_reply;
        const time = formatTime(new Date(msg.created_at));
        const text = msg.content || msg.message_text || '';

        const messageGroup = document.createElement('div');
        messageGroup.className = `message-group ${isOwn ? 'sent' : 'received'}`;
        messageGroup.innerHTML = `
            <div>
                <div class="message-bubble ${isOwn ? 'sent' : 'received'}">
                    ${escapeHtml(text)}
                </div>
                <div class="message-time">${time}</div>
            </div>
        `;

        messagesContainer.appendChild(messageGroup);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // ===== SEND MESSAGE =====
    async function sendMessage() {
        const text = messageInput.value.trim();
        if (!text || !currentSessionId) return;

        messageInput.value = '';

        const { error } = await supabase.from('chat_messages').insert({
            session_id: currentSessionId,
            sender_id: currentUser.id,
            message_text: text,
            is_admin_reply: true
        });

        if (error) {
            console.error('Error sending message:', error);
            alert('خطأ في إرسال الرسالة');
        }
    }

    // ===== SETUP EVENT LISTENERS =====
    function setupEventListeners() {
        // Send message
        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        // Close chat
        closeChat.addEventListener('click', () => {
            currentSessionId = null;
            emptyState.style.display = 'flex';
            chatHeader.style.display = 'none';
            inputArea.style.display = 'none';
            messagesContainer.innerHTML = '';
            document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
        });

        // Search
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allSessions.filter(session => {
                const lastMsg = session.chat_messages?.[session.chat_messages.length - 1];
                return session.id.includes(query) || lastMsg?.message_text?.toLowerCase().includes(query);
            });
            renderChatsList(filtered);
        });

        // Settings modal
        settingsBtn.addEventListener('click', () => {
            document.getElementById('welcomeMsg').value = botSettings?.welcome_message || '';
            document.getElementById('responseDelay').value = botSettings?.response_delay_seconds || 1;
            settingsModal.style.display = 'flex';
        });

        closeSettingsModal.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });

        cancelSettings.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });

        saveSettings.addEventListener('click', async () => {
            const welcomeMsg = document.getElementById('welcomeMsg').value;
            const responseDelay = parseInt(document.getElementById('responseDelay').value);

            const { error } = await supabase.from('bot_settings').update({
                welcome_message: welcomeMsg,
                response_delay_seconds: responseDelay
            }).eq('id', botSettings.id);

            if (!error) {
                alert('تم حفظ الإعدادات بنجاح!');
                settingsModal.style.display = 'none';
                await loadBotSettings();
            }
        });

        // Export modal
        const newChatBtn = document.getElementById('newChatBtn');
        newChatBtn.addEventListener('click', () => {
            exportModal.style.display = 'flex';
        });

        closeExportModal.addEventListener('click', () => {
            exportModal.style.display = 'none';
        });

        cancelExport.addEventListener('click', () => {
            exportModal.style.display = 'none';
        });

        // Export Excel
        exportExcel.addEventListener('click', async () => {
            const { data: sessions } = await supabase
                .from('chat_sessions')
                .select('*, chat_messages(message_text, created_at)')
                .order('updated_at', { ascending: false });

            if (!sessions || sessions.length === 0) {
                alert('لا توجد محادثات للتصدير');
                return;
            }

            let csvContent = 'معرف الجلسة,الحالة,تاريخ الإنشاء,عدد الرسائل\n';
            
            sessions.forEach(session => {
                const createdAt = new Date(session.created_at).toLocaleDateString('ar-SA');
                const messageCount = session.chat_messages?.length || 0;
                csvContent += `"${session.id}","${session.status}","${createdAt}",${messageCount}\n`;
            });

            downloadFile(csvContent, `محادثات_${new Date().toLocaleDateString('ar-SA')}.csv`, 'text/csv');
            exportModal.style.display = 'none';
        });

        // Archive chats
        archiveChats.addEventListener('click', async () => {
            const { data: closedSessions } = await supabase
                .from('chat_sessions')
                .select('*')
                .eq('status', 'closed');

            if (!closedSessions || closedSessions.length === 0) {
                alert('لا توجد محادثات مغلقة للأرشفة');
                return;
            }

            alert(`تم أرشفة ${closedSessions.length} محادثة بنجاح!`);
            exportModal.style.display = 'none';
            await loadAllChats();
        });

        // Close modal on outside click
        document.addEventListener('click', (e) => {
            if (e.target === settingsModal) settingsModal.style.display = 'none';
            if (e.target === exportModal) exportModal.style.display = 'none';
        });
    }

    // ===== UTILITY FUNCTIONS =====
    function formatTime(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'الآن';
        if (minutes < 60) return `${minutes}د`;
        if (hours < 24) return `${hours}س`;
        if (days < 7) return `${days}ي`;
        
        return date.toLocaleDateString('ar-SA');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type: `${type};charset=utf-8;` });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Initialize
    await init();
});
