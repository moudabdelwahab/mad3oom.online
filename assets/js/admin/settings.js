import { supabase } from '/api-config.js';
import { checkAdminAuth, updateAdminUI } from './auth.js';
import { initSidebar } from './sidebar.js';

let user = null;

async function init() {
    initSidebar();
    user = await checkAdminAuth();
    if (!user) return;

    updateAdminUI(user);
    loadAllSettings();
    setupEventListeners();
}

async function loadAllSettings() {
    try {
        // 1. Load Profile Data
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError) throw profileError;

        document.getElementById('fullName').value = profile.full_name || '';
        document.getElementById('email').value = user.email || '';
        document.getElementById('bio').value = profile.bio || '';
        
        // Telegram Settings
        document.getElementById('telegramUsername').value = profile.telegram_username || '';
        document.getElementById('telegramOtpEnabled').checked = profile.telegram_otp_enabled || false;
        
        if (document.getElementById('telegramOtpEnabled').checked) {
            document.getElementById('telegramSetup').style.display = 'block';
        }

        updateAvatarUI(profile.full_name, profile.avatar_url);

        // 2. Load System Settings (from a new table or existing one)
        const { data: systemSettings } = await supabase.from('system_settings').select('*').limit(1).maybeSingle();
        if (systemSettings) {
            document.getElementById('maintenanceMode').checked = systemSettings.maintenance_mode || false;
            document.getElementById('registrationEnabled').checked = systemSettings.registration_enabled !== false;
            document.getElementById('siteNotice').value = systemSettings.site_notice || '';
            document.getElementById('emailVerificationRequired').checked = systemSettings.email_verification_required || false;
            document.getElementById('defaultUserPoints').value = systemSettings.default_user_points || 0;
            document.getElementById('maxActiveTickets').value = systemSettings.max_active_tickets || 3;
        }

        // 3. Load Bot Settings
        const { data: botSettings } = await supabase.from('bot_settings').select('*').limit(1).maybeSingle();
        if (botSettings) {
            document.getElementById('smartMemoryEnabled').checked = botSettings.smart_memory_enabled || false;
            document.getElementById('botSystemPrompt').value = botSettings.system_prompt || '';
        }

    } catch (error) {
        console.error('Error loading settings:', error);
        showAlert('حدث خطأ أثناء تحميل بعض الإعدادات', 'error');
    }
}

function updateAvatarUI(name, url) {
    const preview = document.getElementById('avatarPreview');
    if (url) {
        preview.innerHTML = `<img src="${url}" alt="Profile">`;
    } else {
        const initial = name ? name.charAt(0).toUpperCase() : 'A';
        preview.innerHTML = initial;
    }
}

function setupEventListeners() {
    // Profile Update
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('saveProfileBtn');
        const fullName = document.getElementById('fullName').value;
        const bio = document.getElementById('bio').value;

        setLoading(btn, true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ full_name: fullName, bio: bio })
                .eq('id', user.id);

            if (error) throw error;
            showAlert('تم تحديث الملف الشخصي بنجاح', 'success');
            updateAdminUI({ ...user, full_name: fullName });
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            setLoading(btn, false);
        }
    });

    // Password Update
    document.getElementById('passwordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('savePasswordBtn');
        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;

        if (newPass !== confirmPass) return showAlert('كلمات المرور غير متطابقة', 'error');
        if (newPass.length < 6) return showAlert('يجب أن تكون كلمة المرور 6 أحرف على الأقل', 'error');

        setLoading(btn, true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPass });
            if (error) throw error;
            showAlert('تم تحديث كلمة المرور بنجاح', 'success');
            e.target.reset();
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            setLoading(btn, false);
        }
    });

    // Telegram Toggle
    document.getElementById('telegramOtpEnabled').addEventListener('change', function() {
        document.getElementById('telegramSetup').style.display = this.checked ? 'block' : 'none';
    });

    // Save Telegram
    document.getElementById('saveTelegramBtn').addEventListener('click', async () => {
        const btn = document.getElementById('saveTelegramBtn');
        const username = document.getElementById('telegramUsername').value.trim().replace('@', '');
        const enabled = document.getElementById('telegramOtpEnabled').checked;

        setLoading(btn, true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ telegram_username: username, telegram_otp_enabled: enabled })
                .eq('id', user.id);

            if (error) throw error;
            showAlert('تم حفظ إعدادات التليجرام', 'success');
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            setLoading(btn, false);
        }
    });

    // Save System Settings
    document.getElementById('saveSystemBtn').addEventListener('click', async () => {
        const btn = document.getElementById('saveSystemBtn');
        const settings = {
            maintenance_mode: document.getElementById('maintenanceMode').checked,
            registration_enabled: document.getElementById('registrationEnabled').checked,
            site_notice: document.getElementById('siteNotice').value,
            email_verification_required: document.getElementById('emailVerificationRequired').checked,
            default_user_points: parseInt(document.getElementById('defaultUserPoints').value),
            max_active_tickets: parseInt(document.getElementById('maxActiveTickets').value)
        };

        setLoading(btn, true);
        try {
            // Check if settings exist
            const { data } = await supabase.from('system_settings').select('id').limit(1).maybeSingle();
            let error;
            if (data) {
                ({ error } = await supabase.from('system_settings').update(settings).eq('id', data.id));
            } else {
                ({ error } = await supabase.from('system_settings').insert(settings));
            }
            if (error) throw error;
            showAlert('تم حفظ إعدادات النظام بنجاح', 'success');
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            setLoading(btn, false);
        }
    });

    // Save Bot Settings
    document.getElementById('saveBotBtn').addEventListener('click', async () => {
        const btn = document.getElementById('saveBotBtn');
        const settings = {
            smart_memory_enabled: document.getElementById('smartMemoryEnabled').checked,
            system_prompt: document.getElementById('botSystemPrompt').value
        };

        setLoading(btn, true);
        try {
            const { data } = await supabase.from('bot_settings').select('id').limit(1).maybeSingle();
            let error;
            if (data) {
                ({ error } = await supabase.from('bot_settings').update(settings).eq('id', data.id));
            } else {
                ({ error } = await supabase.from('bot_settings').insert(settings));
            }
            if (error) throw error;
            showAlert('تم تحديث إعدادات ذكاء البوت', 'success');
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            setLoading(btn, false);
        }
    });

    // Avatar Upload
    document.getElementById('avatarInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            showAlert('جاري رفع الصورة...', 'info');
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}-${Math.random()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
            updateAvatarUI(user.full_name, publicUrl);
            showAlert('تم تحديث صورة الحساب بنجاح', 'success');
        } catch (error) {
            showAlert(error.message, 'error');
        }
    });
}

function setLoading(btn, isLoading) {
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.textContent;
        btn.textContent = 'جاري الحفظ...';
    } else {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText;
    }
}

function showAlert(message, type) {
    const alert = document.getElementById('settingsAlert');
    alert.textContent = message;
    alert.className = `alert alert-${type === 'info' ? 'success' : type}`;
    alert.style.display = 'block';
    
    if (type !== 'info') {
        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }
}

init();
