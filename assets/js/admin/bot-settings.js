import { supabase } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    const keywordsList = document.getElementById('keywordsList');
    const keywordInput = document.getElementById('keywordInput');
    const customRepliesList = document.getElementById('customRepliesList');
    const addCustomReplyBtn = document.getElementById('addCustomReply');
    const saveBtn = document.getElementById('saveBotSettings');
    const alertBox = document.getElementById('botAlert');
    
    let currentKeywords = [];
    let customReplies = [];

    // 1. تحميل الإعدادات الحالية
    async function loadSettings() {
        const { data, error } = await supabase
            .from('bot_settings')
            .select('*')
            .maybeSingle();

        if (error) {
            console.error('Error loading settings:', error);
            return;
        }

        if (data) {
            document.getElementById('botEnabled').checked = data.is_enabled;
            document.getElementById('welcomeMessage').value = data.welcome_message || '';
            document.getElementById('ticketMessage').value = data.ticket_confirmation_message || '';
            document.getElementById('responseDelay').value = data.response_delay_seconds || 1;
            document.getElementById('responseFrequency').value = data.response_frequency || 'once';
            document.getElementById('firstChatOnly').checked = data.advanced_first_chat_only || false;
            document.getElementById('ignoreIfOnline').checked = data.advanced_ignore_if_support_online || false;
            document.getElementById('preventDuplicate').checked = data.advanced_prevent_duplicate_tickets || false;
            
            currentKeywords = data.trigger_keywords || [];
            // جلب الردود المخصصة من حقل json في قاعدة البيانات (سنفترض وجود حقل custom_replies)
            customReplies = data.custom_replies || [];
            
            renderKeywords();
            renderCustomReplies();
        }
    }

    // 2. عرض الكلمات المفتاحية لفتح التذاكر
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

    // 3. عرض الردود المخصصة
    function renderCustomReplies() {
        customRepliesList.innerHTML = '';
        customReplies.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'form-group';
            div.style.padding = '1rem';
            div.style.border = '1px solid #eee';
            div.style.borderRadius = '8px';
            div.style.marginBottom = '1rem';
            div.style.position = 'relative';
            
            div.innerHTML = `
                <button type="button" class="remove-reply" data-index="${index}" style="position: absolute; left: 10px; top: 10px; background: none; border: none; color: red; cursor: pointer; font-weight: bold;">حذف</button>
                <div style="margin-bottom: 0.5rem;">
                    <label style="font-size: 0.85rem;">إذا أرسل المستخدم كلمة:</label>
                    <input type="text" class="form-control reply-trigger" value="${item.trigger}" placeholder="مثال: دعم">
                </div>
                <div>
                    <label style="font-size: 0.85rem;">يرد البوت بـ:</label>
                    <textarea class="form-control reply-response" rows="2" placeholder="مثال: يمكنك التواصل معنا عبر الواتساب...">${item.response}</textarea>
                </div>
            `;
            
            div.querySelector('.remove-reply').addEventListener('click', () => {
                customReplies.splice(index, 1);
                renderCustomReplies();
            });
            
            customRepliesList.appendChild(div);
        });
    }

    // 4. إضافة كلمة مفتاحية جديدة (تذاكر)
    keywordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const word = keywordInput.value.trim();
            if (word && !currentKeywords.includes(word)) {
                currentKeywords.push(word);
                renderKeywords();
            }
            keywordInput.value = '';
        }
    });

    // 5. إضافة رد مخصص جديد
    addCustomReplyBtn.addEventListener('click', () => {
        customReplies.push({ trigger: '', response: '' });
        renderCustomReplies();
    });

    // 6. حفظ الإعدادات
    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.innerText = 'جاري الحفظ...';

        // تجميع الردود المخصصة من الواجهة
        const updatedCustomReplies = [];
        const triggerInputs = document.querySelectorAll('.reply-trigger');
        const responseInputs = document.querySelectorAll('.reply-response');
        
        triggerInputs.forEach((input, index) => {
            const trigger = input.value.trim();
            const response = responseInputs[index].value.trim();
            if (trigger && response) {
                updatedCustomReplies.push({ trigger, response });
            }
        });

        const settings = {
            is_enabled: document.getElementById('botEnabled').checked,
            welcome_message: document.getElementById('welcomeMessage').value,
            ticket_confirmation_message: document.getElementById('ticketMessage').value,
            trigger_keywords: currentKeywords,
            custom_replies: updatedCustomReplies, // الميزة الجديدة
            response_delay_seconds: parseInt(document.getElementById('responseDelay').value) || 1,
            response_frequency: document.getElementById('responseFrequency').value,
            advanced_first_chat_only: document.getElementById('firstChatOnly').checked,
            advanced_ignore_if_support_online: document.getElementById('ignoreIfOnline').checked,
            advanced_prevent_duplicate_tickets: document.getElementById('preventDuplicate').checked,
            updated_at: new Date().toISOString()
        };

        try {
            // الحصول على المعرف الحالي
            const { data: currentData } = await supabase.from('bot_settings').select('id').maybeSingle();
            
            let result;
            if (currentData) {
                result = await supabase
                    .from('bot_settings')
                    .update(settings)
                    .eq('id', currentData.id);
            } else {
                result = await supabase
                    .from('bot_settings')
                    .insert([settings]);
            }

            if (result.error) throw result.error;

            alertBox.style.display = 'block';
            alertBox.className = 'alert alert-success';
            alertBox.innerText = 'تم حفظ كافة الإعدادات بنجاح!';
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
        } catch (err) {
            console.error('Save error:', err);
            alertBox.style.display = 'block';
            alertBox.className = 'alert alert-danger';
            alertBox.innerText = 'حدث خطأ أثناء الحفظ: ' + err.message;
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerText = 'حفظ كافة الإعدادات';
        }
    });

    loadSettings();
});
