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

        // Update avatar preview
        updateAvatarUI(profile.full_name, profile.avatar_url);
    } catch (error) {
        console.error('Error loading user data:', error);
        showAlert('حدث خطأ أثناء تحميل البيانات', 'error');
    }
}

function updateAvatarUI(name, url) {
    const preview = document.getElementById('avatarPreview');
    const initials = document.getElementById('initialsDisplay');
    
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
                .update({ full_name: fullName, updated_at: new Date() })
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
            const filePath = fileName; // الرفع مباشرة في الـ bucket بدون مجلدات فرعية لتجنب مشاكل الصلاحيات

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
                    avatar_url: publicUrl,
                    updated_at: new Date().toISOString()
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

function showAlert(message, type) {
    const alert = document.getElementById('settingsAlert');
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    alert.style.display = 'block';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });

    setTimeout(() => {
        alert.style.display = 'none';
    }, 5000);
}

init();
