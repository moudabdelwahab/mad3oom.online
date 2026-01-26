-- 1. تحديث جدول الأدوار (Roles)
-- إضافة دور 'support' إذا لم يكن موجوداً
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        -- ملاحظة: إذا كان العمود نصياً، سنتعامل معه كنص
    END IF;
END $$;

-- 2. إنشاء جدول الإشعارات (Notifications)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info', -- 'info', 'success', 'warning', 'error'
    link TEXT, -- رابط للتوجه إليه عند النقر
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System/Admins can insert notifications" ON notifications
    FOR INSERT WITH CHECK (true); -- في بيئة الإنتاج يفضل تقييدها أكثر

CREATE POLICY "Users can update their own notifications (mark as read)" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- 3. إنشاء جدول سجل النشاطات (Activity Logs)
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- 'login', 'logout', 'impersonate', 'status_change', etc.
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all activity logs" ON activity_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "System can insert activity logs" ON activity_logs
    FOR INSERT WITH CHECK (true);

-- 4. تحديث جدول الردود لدعم الملاحظات الداخلية (Internal Notes)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ticket_replies' AND column_name='is_internal') THEN
        ALTER TABLE ticket_replies ADD COLUMN is_internal BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 5. تفعيل Realtime للجداول الجديدة
-- يجب تنفيذ هذا في Supabase Dashboard أو عبر SQL إذا كان مسموحاً
-- ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
-- ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
-- ALTER PUBLICATION supabase_realtime ADD TABLE ticket_replies;
