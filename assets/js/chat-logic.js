import { supabase } from '../../api-config.js';

document.addEventListener('DOMContentLoaded', async () => {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chatMessages');
    const typingIndicator = document.getElementById('typingIndicator');
    
    let currentUser = null;
    let currentSessionId = null;
    let botSettings = null;
    let botReplyCount = 0;

    // 1. الحصول على بيانات المستخدم الحالي
    async function initAuth() {
        try {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) {
                console.warn('Auth error or no user:', error);
                // محاولة فحص الجلسة كضيف من localStorage كحل بديل
                const guestSession = localStorage.getItem('mad3oom-guest-session');
                if (guestSession) {
                    currentUser = JSON.parse(guestSession);
                    console.log('Using guest session:', currentUser);
                } else {
                    window.location.href = '/sign-in.html';
                    return;
                }
            } else {
                currentUser = user;
                console.log('User authenticated:', currentUser.id);
            }
        } catch (err) {
            console.error('Auth initialization failed:', err);
            window.location.href = '/sign-in.html';
        }
    }

    // 2. تحميل إعدادات البوت
    async function loadBotSettings() {
        try {
            const { data, error } = await supabase.from('bot_settings').select('*').limit(1).maybeSingle();
            if (error) throw error;
            botSettings = data;
            console.log('Bot settings loaded:', botSettings);
        } catch (err) {
            console.error('Error loading bot settings:', err);
        } finally {
            // إعدادات افتراضية في حال فشل التحميل أو عدم وجود بيانات
            if (!botSettings) {
                botSettings = {
                    is_enabled: true,
                    welcome_message: 'أهلاً بك في منصة مدعوم! كيف يمكننا مساعدتك اليوم؟',
                    ticket_confirmation_message: 'تم فتح تذكرة دعم وسيتم التواصل معك قريبًا.',
                    trigger_keywords: ['مشكلة', 'عطل', 'مش شغال', 'problem', 'issue', 'help'],
                    response_delay_seconds: 1,
                    response_frequency: 'once'
                };
            }
        }
    }

    // 3. إضافة رسالة للواجهة
    function appendMessage(text, type, timestamp = new Date()) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        const date = new Date(timestamp);
        const hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;
        messageDiv.innerHTML = `${text}<span class="message-time">${timeStr}</span>`;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // 4. إرسال رد البوت
    async function sendBotReply(text) {
        if (!botSettings || !botSettings.is_enabled) return;

        typingIndicator.style.display = 'block';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        const delay = (botSettings.response_delay_seconds || 1) * 1000;

        setTimeout(async () => {
            typingIndicator.style.display = 'none';
            appendMessage(text, 'received');
            botReplyCount++;
            
            if (currentSessionId) {
                try {
                    await supabase.from('chat_messages').insert([{
                        session_id: currentSessionId,
                        message_text: text,
                        is_bot_reply: true
                    }]);
                } catch (err) {
                    console.error('Error saving bot reply:', err);
                }
            }
        }, delay);
    }

    // 5. إنشاء أو جلب جلسة المحادثة
    async function getOrCreateSession() {
        if (!currentUser) return;
        
        try {
            const { data: sessions, error } = await supabase
                .from('chat_sessions')
                .select('id')
                .eq('user_id', currentUser.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1);

            if (sessions && sessions.length > 0) {
                currentSessionId = sessions[0].id;
                console.log('Existing session found:', currentSessionId);
                await loadMessages();
            } else {
                console.log('Creating new session...');
                const { data: newSession, error: createError } = await supabase
                    .from('chat_sessions')
                    .insert([{ user_id: currentUser.id }])
                    .select()
                    .single();
                
                if (createError) throw createError;
                
                if (newSession) {
                    currentSessionId = newSession.id;
                    console.log('New session created:', currentSessionId);
                    // إرسال رسالة ترحيب فورية للجلسة الجديدة
                    if (botSettings && botSettings.is_enabled) {
                        sendBotReply(botSettings.welcome_message);
                    }
                }
            }
        } catch (err) {
            console.error('Session error:', err);
            // في حال فشل قاعدة البيانات، نظهر الرسالة الترحيبية على الأقل في الواجهة
            if (botSettings && botSettings.is_enabled && chatMessages.children.length === 0) {
                sendBotReply(botSettings.welcome_message);
            }
        }
    }

    // 6. تحميل الرسائل السابقة
    async function loadMessages() {
        if (!currentSessionId) return;
        
        try {
            const { data: messages, error } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('session_id', currentSessionId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            if (messages && messages.length > 0) {
                chatMessages.innerHTML = '';
                messages.forEach(msg => {
                    appendMessage(msg.message_text, msg.is_bot_reply ? 'received' : 'sent', msg.created_at);
                    if (msg.is_bot_reply) botReplyCount++;
                });
            } else {
                // إذا كانت الجلسة موجودة ولكن لا توجد رسائل، أرسل الترحيب
                if (botSettings && botSettings.is_enabled) {
                    sendBotReply(botSettings.welcome_message);
                }
            }
        } catch (err) {
            console.error('Error loading messages:', err);
            if (botSettings && botSettings.is_enabled && chatMessages.children.length === 0) {
                sendBotReply(botSettings.welcome_message);
            }
        }
    }

    // 7. منطق البوت الذكي عند إرسال رسالة
    async function handleBotLogic(userText) {
        if (!botSettings || !botSettings.is_enabled) return;

        // التحقق من تكرار الرد إذا كان مضبوطاً على "مرة واحدة"
        if (botSettings.response_frequency === 'once' && botReplyCount >= 2) return; 
        
        const lowerText = userText.toLowerCase();
        const triggerFound = (botSettings.trigger_keywords || []).some(word => lowerText.includes(word.toLowerCase()));

        if (triggerFound) {
            await sendBotReply(botSettings.ticket_confirmation_message);
            await createAutoTicket(userText);
        }
    }

    // 8. فتح تذكرة تلقائياً
    async function createAutoTicket(originalMessage) {
        if (!currentUser) return;
        try {
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
        } catch (err) {
            console.error('Ticket creation error:', err);
        }
    }

    // 9. إرسال رسالة المستخدم
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        
        // إظهار الرسالة في الواجهة فوراً لتحسين تجربة المستخدم
        appendMessage(text, 'sent');
        chatInput.value = '';

        if (!currentSessionId) {
            console.warn('No active session, message not saved to DB');
            handleBotLogic(text);
            return;
        }

        try {
            const { error } = await supabase.from('chat_messages').insert([{
                session_id: currentSessionId,
                sender_id: currentUser ? currentUser.id : null,
                message_text: text,
                is_bot_reply: false
            }]);

            if (!error) {
                handleBotLogic(text);
            } else {
                console.error('Error saving message to DB:', error);
            }
        } catch (err) {
            console.error('Send message exception:', err);
            // استمرار منطق البوت حتى لو فشل الحفظ في القاعدة
            handleBotLogic(text);
        }
    }

    // الأحداث
    if (sendBtn) {
        sendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sendMessage();
        });
    }
    
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // التشغيل التسلسلي لضمان الترتيب
    try {
        await initAuth();
        await loadBotSettings();
        await getOrCreateSession();
    } catch (err) {
        console.error('Initialization flow failed:', err);
    }
});
