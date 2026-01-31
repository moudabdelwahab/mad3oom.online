import { supabase } from './admin/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chatMessages');
    
    let currentUser = null;
    let currentSessionId = null;
    let botSettings = null;
    let botReplyCount = 0;

    // 1. الحصول على بيانات المستخدم الحالي
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;

    if (!currentUser) {
        window.location.href = '/sign-in.html';
        return;
    }

    // 2. تحميل إعدادات البوت
    async function loadBotSettings() {
        const { data, error } = await supabase.from('bot_settings').select('*').single();
        if (!error) botSettings = data;
    }

    // 3. إنشاء أو جلب جلسة المحادثة
    async function getOrCreateSession() {
        const { data: sessions, error } = await supabase
            .from('chat_sessions')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1);

        if (sessions && sessions.length > 0) {
            currentSessionId = sessions[0].id;
            loadMessages();
        } else {
            const { data: newSession, error: createError } = await supabase
                .from('chat_sessions')
                .insert([{ user_id: currentUser.id }])
                .select()
                .single();
            if (newSession) currentSessionId = newSession.id;
        }
    }

    // 4. تحميل الرسائل السابقة
    async function loadMessages() {
        const { data: messages, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', currentSessionId)
            .order('created_at', { ascending: true });

        if (messages) {
            chatMessages.innerHTML = '';
            messages.forEach(msg => {
                appendMessage(msg.message_text, msg.is_bot_reply ? 'received' : 'sent', msg.created_at);
                if (msg.is_bot_reply) botReplyCount++;
            });
        }
    }

    // 5. إضافة رسالة للواجهة
    function appendMessage(text, type, timestamp = new Date()) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        const date = new Date(timestamp);
        const timeStr = date.getHours() + ":" + date.getMinutes().toString().padStart(2, '0');
        messageDiv.innerHTML = `${text}<span class="message-time">${timeStr}</span>`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 6. منطق البوت الذكي
    async function handleBotLogic(userText) {
        if (!botSettings || !botSettings.is_enabled) return;

        // التحقق من تكرار الرد
        if (botSettings.response_frequency === 'once' && botReplyCount > 0) return;
        
        // التحقق من "أول محادثة فقط"
        if (botSettings.advanced_first_chat_only && botReplyCount > 0) return;

        const lowerText = userText.toLowerCase();
        let botResponse = "";
        let shouldOpenTicket = false;

        // التحقق من الكلمات المفتاحية لفتح تذكرة
        const triggerFound = botSettings.trigger_keywords.some(word => lowerText.includes(word.toLowerCase()));

        if (triggerFound) {
            shouldOpenTicket = true;
            botResponse = botSettings.ticket_confirmation_message;
        } else if (botReplyCount === 0) {
            botResponse = botSettings.welcome_message;
        }

        if (botResponse) {
            // تأخير الرد حسب الإعدادات
            setTimeout(async () => {
                appendMessage(botResponse, 'received');
                botReplyCount++;
                
                // حفظ رد البوت في قاعدة البيانات
                await supabase.from('chat_messages').insert([{
                    session_id: currentSessionId,
                    message_text: botResponse,
                    is_bot_reply: true
                }]);

                if (shouldOpenTicket) {
                    await createAutoTicket(userText);
                }
            }, botSettings.response_delay_seconds * 1000);
        }
    }

    // 7. فتح تذكرة تلقائياً
    async function createAutoTicket(originalMessage) {
        if (botSettings.advanced_prevent_duplicate_tickets) {
            const { data: existing } = await supabase
                .from('tickets')
                .select('id')
                .eq('user_id', currentUser.id)
                .eq('status', 'open')
                .limit(1);
            if (existing && existing.length > 0) return;
        }

        await supabase.from('tickets').insert([{
            user_id: currentUser.id,
            title: 'تذكرة تلقائية من المحادثة',
            description: originalMessage,
            status: 'open',
            priority: 'medium'
        }]);
    }

    // 8. إرسال رسالة
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (text && currentSessionId) {
            appendMessage(text, 'sent');
            chatInput.value = '';

            // حفظ رسالة المستخدم
            const { error } = await supabase.from('chat_messages').insert([{
                session_id: currentSessionId,
                sender_id: currentUser.id,
                message_text: text,
                is_bot_reply: false
            }]);

            if (!error) {
                handleBotLogic(text);
            }
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // البدء
    await loadBotSettings();
    await getOrCreateSession();
});
