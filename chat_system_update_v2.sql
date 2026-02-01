-- 1. تحديث جدول جلسات المحادثة (Chat Sessions)
-- تغيير نوع user_id ليدعم الضيوف (نصي بدلاً من UUID)
-- ملاحظة: في Supabase لا يمكن تغيير نوع العمود بسهولة إذا كان عليه قيود، سنقوم بإضافة عمود جديد للضيوف
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS guest_id TEXT;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS is_manual_mode BOOLEAN DEFAULT FALSE;

-- 2. تحديث جدول رسائل المحادثة (Chat Messages)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_admin_reply BOOLEAN DEFAULT FALSE;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_id TEXT;

-- 3. تفعيل RLS (Row Level Security) إذا لم تكن مفعلة
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- حذف السياسات القديمة لتجنب التعارض (اختياري ولكن مفضل)
DROP POLICY IF EXISTS "Enable read for all users" ON chat_sessions;
DROP POLICY IF EXISTS "Enable insert for all users" ON chat_sessions;
DROP POLICY IF EXISTS "Enable update for admins" ON chat_sessions;
DROP POLICY IF EXISTS "Enable read for all users" ON chat_messages;
DROP POLICY IF EXISTS "Enable insert for all users" ON chat_messages;

-- سياسات الوصول لجدول الجلسات
CREATE POLICY "Enable read for all users" ON chat_sessions FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for admins" ON chat_sessions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- سياسات الوصول لجدول الرسائل
CREATE POLICY "Enable read for all users" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON chat_messages FOR INSERT WITH CHECK (true);

-- تأكد من وجود إعدادات افتراضية في bot_settings
INSERT INTO bot_settings (is_enabled, welcome_message) 
SELECT true, 'مرحباً بك في منصة مدعوم! كيف يمكنني مساعدتك اليوم؟' 
WHERE NOT EXISTS (SELECT 1 FROM bot_settings);
