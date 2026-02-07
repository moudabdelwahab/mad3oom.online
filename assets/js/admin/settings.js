import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';

let user = null;

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return;

    updateAdminUI(user);
    loadUserData();
    setupEventListeners();
}

async function loadUserData() {
    try {
        // Get profile data
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        // Fill form fields
        document.getElementById('fullName').value = profile.full_name || '';
        document.getElementById('email').value = user.email || '';

        // Fill Telegram fields
        document.getElementById('telegramUsername').value = profile.telegram_username || '';
        document.getElementById('telegramOtpEnabled').checked = profile.telegram_otp_enabled || false;
        
        if (profile.telegram_chat_id) {
            document.getElementById('telegramChatId').value = profile.telegram_chat_id;
            document.getElementById('chatIdContainer').style.display = 'block';
            document.getElementById('botInstructions').style.display = 'none';
        } else {
            document.getElementById('botInstructions').style.display = 'block';
        }

        // Update avatar preview
        updateAvatarUI(profile.full_name, profile.avatar_url);

        // Start polling for chat_id if not present
        if (!profile.telegram_chat_id) {
            startChatIdPolling();
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        showAlert('حدث خطأ أثناء تحميل البيانات', 'error');
    }
}

function updateAvatarUI(name, url) {
    const preview = document.getElementById('avatarPreview');
    
    if (url) {
        preview.innerHTML = `<img src="${url}" alt="Profile">`;
    } else {
        const initial = name ? name.charAt(0).toUpperCase() : 'A';
        preview.innerHTML = `<span id="initialsDisplay">${initial}</span>`;
    }
}

function setupEventListeners() {
    // Profile Form
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('fullName').value;
        const btn = document.getElementById('saveProfileBtn');
        
        btn.disabled = true;
        btn.textContent = 'جاري الحفظ...';

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ full_name: fullName })
                .eq('id', user.id);

            if (error) throw error;
            showAlert('تم تحديث المعلومات الشخصية بنجاح', 'success');
            updateAdminUI({ ...user, full_name: fullName });
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'حفظ التغييرات';
        }
    });

    // Email Form
    document.getElementById('emailForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newEmail = document.getElementById('newEmail').value;
        const btn = document.getElementById('saveEmailBtn');

        if (!newEmail) return showAlert('يرجى إدخال البريد الإلكتروني الجديد', 'error');

        btn.disabled = true;
        btn.textContent = 'جاري التحديث...';

        try {
            const { error } = await supabase.auth.updateUser({ email: newEmail });
            if (error) throw error;
            showAlert('تم إرسال رابط تأكيد إلى البريد الجديد', 'success');
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'تحديث البريد';
        }
    });

    // Password Form
    document.getElementById('passwordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const btn = document.getElementById('savePasswordBtn');

        if (newPassword !== confirmPassword) {
            return showAlert('كلمات المرور غير متطابقة', 'error');
        }
        if (newPassword.length < 6) {
            return showAlert('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
        }

        btn.disabled = true;
        btn.textContent = 'جاري التحديث...';

        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            showAlert('تم تحديث كلمة المرور بنجاح', 'success');
            e.target.reset();
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'تحديث كلمة المرور';
        }
    });

    // Telegram Form
    document.getElementById('telegramForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('telegramUsername').value.trim().replace('@', '');
        const enabled = document.getElementById('telegramOtpEnabled').checked;
        const btn = document.getElementById('saveTelegramBtn');

        btn.disabled = true;
        btn.textContent = 'جاري الحفظ...';

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ 
                    telegram_username: username, 
                    telegram_otp_enabled: enabled
                })
                .eq('id', user.id);

            if (error) throw error;
            showAlert('تم تحديث إعدادات التليجرام بنجاح', 'success');
            
            if (!document.getElementById('telegramChatId').value) {
                document.getElementById('botInstructions').style.display = 'block';
            }
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'حفظ إعدادات التليجرام';
        }
    });

    // Broadcast Form
    const broadcastForm = document.getElementById('broadcastForm');
    if (broadcastForm) {
        broadcastForm.onsubmit = async (e) => {
            e.preventDefault();
            e.stopPropagation(); // منع أي انتشار للحدث قد يسبب تحديث الصفحة
            
            const titleInput = document.getElementById('broadcastTitle');
            const messageInput = document.getElementById('broadcastMessage');
            const btn = document.getElementById('sendBroadcastBtn');
            
            const title = titleInput.value.trim();
            const message = messageInput.value.trim();

            if (!title || !message) {
                showAlert('يرجى ملء جميع الحقول', 'error');
                return false;
            }

            if (!confirm('هل أنت متأكد من إرسال هذا الإشعار لجميع المستخدمين؟')) return false;

            btn.disabled = true;
            const originalHTML = btn.innerHTML;
            btn.textContent = 'جاري الإرسال...';

            try {
                // إضافة timestamp لإجبار المتصفح على تحميل أحدث نسخة وتجنب الـ Cache
                const serviceUrl = `/notifications-service.js?v=${Date.now()}`;
                console.log('Importing notifications service from:', serviceUrl);
                
                const module = await import(serviceUrl);
                const broadcastNotification = module.broadcastNotification;
                
                // التحقق من وجود الدالة قبل استدعائها
                if (typeof broadcastNotification === 'function') {
                    await broadcastNotification({ title, message, type: 'info' });
                } else {
                    console.error('Imported Module Content:', module);
                    throw new Error('تعذر العثور على وظيفة الإرسال في ملف الخدمة. يرجى تحديث الصفحة (Refresh) والمحاولة مرة أخرى.');
                }
                
                showAlert('تم إرسال الإشعار الجماعي بنجاح لجميع المستخدمين', 'success');
                broadcastForm.reset();
            } catch (error) {
                console.error('Broadcast error:', error);
                showAlert('فشل إرسال الإشعار الجماعي: ' + (error.message || 'خطأ غير معروف'), 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
            }
            return false;
        };
    }

    // Smart Memory Logic
    const smartMemoryEnabled = document.getElementById('smartMemoryEnabled');
    const memoryHistoryContainer = document.getElementById('memoryHistoryContainer');
    const memoryTableBody = document.getElementById('memoryTableBody');
    const saveSmartMemoryBtn = document.getElementById('saveSmartMemoryBtn');

    async function loadSmartMemorySettings() {
        try {
            const { data: botSettings } = await supabase.from('bot_settings').select('smart_memory_enabled').limit(1).maybeSingle();
            if (botSettings) {
                smartMemoryEnabled.checked = botSettings.smart_memory_enabled;
                if (smartMemoryEnabled.checked) {
                    memoryHistoryContainer.style.display = 'block';
                    loadMemoryHistory();
                    subscribeToMemoryChanges();
                }
            }
        } catch (error) {
            console.error('Error loading smart memory settings:', error);
        }
    }

    async function loadMemoryHistory() {
        try {
            const { data: memory, error } = await supabase
                .from('chatbot_memory')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            renderMemoryTable(memory);
        } catch (error) {
            console.error('Error loading memory history:', error);
        }
    }

    function renderMemoryTable(memory) {
        if (!memoryTableBody) return;
        memoryTableBody.innerHTML = '';
        
        if (!memory || memory.length === 0) {
            memoryTableBody.innerHTML = '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #888;">لا توجد بيانات في الذاكرة حالياً.</td></tr>';
            return;
        }

        memory.forEach(item => {
            const tr = document.createElement('tr');
            tr.id = `memory-row-${item.id}`;
            tr.innerHTML = `
                <td style="padding: 12px; border: 1px solid #e2e8f0;">${item.user_message}</td>
                <td style="padding: 12px; border: 1px solid #e2e8f0;">
                    <textarea class="form-control memory-edit-input" data-id="${item.id}" style="min-height: 60px; font-size: 0.85rem;">${item.admin_reply}</textarea>
                </td>
                <td style="padding: 12px; border: 1px solid #e2e8f0; text-align: center;">
                    <button class="btn-delete-memory" data-id="${item.id}" style="background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">حذف</button>
                </td>
            `;
            memoryTableBody.appendChild(tr);
        });

        // إضافة أحداث الحذف والتعديل
        document.querySelectorAll('.btn-delete-memory').forEach(btn => {
            btn.onclick = async () => {
                if (confirm('هل أنت متأكد من حذف هذا السجل من الذاكرة؟')) {
                    const id = btn.dataset.id;
                    const { error } = await supabase.from('chatbot_memory').delete().eq('id', id);
                    if (!error) {
                        document.getElementById(`memory-row-${id}`).remove();
                        showAlert('تم حذف السجل بنجاح', 'success');
                    }
                }
            };
        });

        document.querySelectorAll('.memory-edit-input').forEach(input => {
            input.onchange = async () => {
                const id = input.dataset.id;
                const newReply = input.value.trim();
                const { error } = await supabase.from('chatbot_memory').update({ admin_reply: newReply }).eq('id', id);
                if (!error) {
                    showAlert('تم تحديث الذاكرة بنجاح', 'success');
                }
            };
        });
    }

    function subscribeToMemoryChanges() {
        supabase.channel('chatbot_memory_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chatbot_memory' }, (payload) => {
                loadMemoryHistory(); // إعادة تحميل الجدول عند حدوث أي تغيير
            })
            .subscribe();
    }

    if (smartMemoryEnabled) {
        smartMemoryEnabled.onchange = () => {
            memoryHistoryContainer.style.display = smartMemoryEnabled.checked ? 'block' : 'none';
            if (smartMemoryEnabled.checked) loadMemoryHistory();
        };
    }

    if (saveSmartMemoryBtn) {
        saveSmartMemoryBtn.onclick = async () => {
            saveSmartMemoryBtn.disabled = true;
            const originalText = saveSmartMemoryBtn.textContent;
            saveSmartMemoryBtn.textContent = 'جاري الحفظ...';
            
            try {
                const { error } = await supabase
                    .from('bot_settings')
                    .update({ smart_memory_enabled: smartMemoryEnabled.checked })
                    .not('id', 'is', null); // تحديث السجل الموجود
                
                if (error) throw error;
                showAlert('تم حفظ إعدادات الذاكرة الذكية بنجاح', 'success');
            } catch (error) {
                console.error('Error saving memory settings:', error);
                showAlert('فشل حفظ الإعدادات: ' + error.message, 'error');
            } finally {
                saveSmartMemoryBtn.disabled = false;
                saveSmartMemoryBtn.textContent = originalText;
            }
        };
    }

    loadSmartMemorySettings();

    // Avatar Upload
    document.getElementById('avatarInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const btn = document.querySelector('.btn-upload');
        const originalText = btn.textContent;
        btn.textContent = 'جاري الرفع...';
        btn.disabled = true;

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}-${Date.now()}.${fileExt}`;
            const filePath = fileName;

            // Upload image to Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) {
                console.error('Upload error details:', uploadError);
                throw new Error(`فشل الرفع: ${uploadError.message}`);
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // Update profile
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ 
                    avatar_url: publicUrl
                })
                .eq('id', user.id);

            if (updateError) throw updateError;

            // تحديث الواجهة المحلية
            updateAvatarUI(null, publicUrl);
            
            // تحديث النافبار
            if (typeof updateAdminUI === 'function') {
                const updatedUser = { ...user };
                if (!updatedUser.profile) updatedUser.profile = {};
                updatedUser.profile.avatar_url = publicUrl;
                updateAdminUI(updatedUser);
            }

            showAlert('تم تحديث صورة الملف الشخصي بنجاح', 'success');
        } catch (error) {
            console.error('Avatar upload error:', error);
            showAlert(error.message || 'فشل رفع الصورة. يرجى المحاولة مرة أخرى.', 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
}

let pollingInterval = null;
async function startChatIdPolling() {
    if (pollingInterval) return;

    pollingInterval = setInterval(async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('telegram_chat_id')
                .eq('id', user.id)
                .single();

            if (error) throw error;

            if (data && data.telegram_chat_id) {
                document.getElementById('telegramChatId').value = data.telegram_chat_id;
                document.getElementById('chatIdContainer').style.display = 'block';
                document.getElementById('botInstructions').style.display = 'none';
                showAlert('تم ربط حساب التليجرام بنجاح واستخراج Chat ID', 'success');
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    }, 5000); // كل 5 ثواني
}

function showAlert(message, type) {
    const alert = document.getElementById('settingsAlert');
    if (!alert) {
        alert(message);
        return;
    }
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    alert.style.display = 'block';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

    setTimeout(() => {
        alert.style.display = 'none';
    }, 5000);
}

init();
