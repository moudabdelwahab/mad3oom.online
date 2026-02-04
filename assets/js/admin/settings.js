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
