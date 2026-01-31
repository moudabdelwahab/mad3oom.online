import { supabase } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    const keywordsList = document.getElementById('keywordsList');
    const keywordInput = document.getElementById('keywordInput');
    const saveBtn = document.getElementById('saveBotSettings');
    const alertBox = document.getElementById('botAlert');
    
    let currentKeywords = [];

    // 1. تحميل الإعدادات الحالية
    async function loadSettings() {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('*')
            .single();

        if (error) {
            console.error('Error loading settings:', error);
            return;
        }

        if (data) {
            document.getElementById('botEnabled').checked = data.is_enabled;
            document.getElementById('welcomeMessage').value = data.welcome_message;
            document.getElementById('ticketMessage').value = data.ticket_confirmation_message;
            document.getElementById('responseDelay').value = data.response_delay_seconds;
            document.getElementById('responseFrequency').value = data.response_frequency;
            document.getElementById('firstChatOnly').checked = data.advanced_first_chat_only;
            document.getElementById('ignoreIfOnline').checked = data.advanced_ignore_if_support_online;
            document.getElementById('preventDuplicate').checked = data.advanced_prevent_duplicate_tickets;
            
            currentKeywords = data.trigger_keywords || [];
            renderKeywords();
        }
    }

    // 2. عرض الكلمات المفتاحية
    function renderKeywords() {
        keywordsList.innerHTML = '';
        currentKeywords.forEach((word, index) => {
            const tag = document.createElement('div');
            tag.className = 'keyword-tag';
            tag.innerHTML = `${word} <span data-index="${index}">&times;</span>`;
            tag.querySelector('span').addEventListener('click', (e) => {
                const idx = e.target.dataset.index;
                currentKeywords.splice(idx, 1);
                renderKeywords();
            });
            keywordsList.appendChild(tag);
        });
    }

    // 3. إضافة كلمة مفتاحية جديدة
    keywordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && keywordInput.value.trim()) {
            const word = keywordInput.value.trim();
            if (!currentKeywords.includes(word)) {
                currentKeywords.push(word);
                renderKeywords();
            }
            keywordInput.value = '';
        }
    });

    // 4. حفظ الإعدادات
    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.innerText = 'جاري الحفظ...';

        const settings = {
            is_enabled: document.getElementById('botEnabled').checked,
            welcome_message: document.getElementById('welcomeMessage').value,
            ticket_confirmation_message: document.getElementById('ticketMessage').value,
            trigger_keywords: currentKeywords,
            response_delay_seconds: parseInt(document.getElementById('responseDelay').value),
            response_frequency: document.getElementById('responseFrequency').value,
            advanced_first_chat_only: document.getElementById('firstChatOnly').checked,
            advanced_ignore_if_support_online: document.getElementById('ignoreIfOnline').checked,
            advanced_prevent_duplicate_tickets: document.getElementById('preventDuplicate').checked,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('bot_settings')
            .update(settings)
            .eq('id', (await supabase.from('bot_settings').select('id').single()).data.id);

        if (error) {
            alert('حدث خطأ أثناء الحفظ: ' + error.message);
        } else {
            alertBox.style.display = 'block';
            setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
        }

        saveBtn.disabled = false;
        saveBtn.innerText = 'حفظ كافة الإعدادات';
    });

    loadSettings();
});
