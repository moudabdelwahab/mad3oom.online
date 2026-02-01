-- 1. جدول جلسات المحادثة (Chat Sessions)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL, -- يمكن أن يكون UUID للمستخدم المسجل أو ID نصي للضيف
    status TEXT DEFAULT 'active', -- 'active', 'closed', 'paused'
    is_manual_mode BOOLEAN DEFAULT FALSE, -- هل الرد يدوي من الإدارة أم تلقائي من البوت
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. جدول رسائل المحادثة (Chat Messages)
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    is_bot_reply BOOLEAN DEFAULT FALSE,
    is_admin_reply BOOLEAN DEFAULT FALSE,
    sender_id TEXT, -- ID المرسل (المستخدم أو الأدمن)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. جدول إعدادات البوت (Bot Settings)
CREATE TABLE IF NOT EXISTS bot_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bot_enabled BOOLEAN DEFAULT TRUE,
    welcome_message TEXT DEFAULT 'مرحباً بك في منصة مدعوم! كيف يمكنني مساعدتك اليوم؟',
    ticket_message TEXT DEFAULT 'تم فتح تذكرة دعم فني وسيقوم فريقنا بالرد عليك في أقرب وقت.',
    response_delay_seconds INTEGER DEFAULT 1,
    keywords TEXT[] DEFAULT '{}',
    custom_replies JSONB DEFAULT '[]',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل RLS (Row Level Security)
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;

-- سياسات الوصول لجدول الجلسات
CREATE POLICY "Enable read for all users" ON chat_sessions FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for admins" ON chat_sessions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- سياسات الوصول لجدول الرسائل
CREATE POLICY "Enable read for all users" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON chat_messages FOR INSERT WITH CHECK (true);

-- سياسات الوصول لجدول الإعدادات
CREATE POLICY "Enable read for all users" ON bot_settings FOR SELECT USING (true);
CREATE POLICY "Enable update for admins" ON bot_settings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- إضافة بيانات افتراضية للإعدادات إذا لم تكن موجودة
INSERT INTO bot_settings (bot_enabled) 
SELECT true WHERE NOT EXISTS (SELECT 1 FROM bot_settings);
