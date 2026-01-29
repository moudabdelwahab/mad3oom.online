-- إنشاء جدول محفظة المستخدم (User Wallets)
CREATE TABLE IF NOT EXISTS user_wallets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    total_points INTEGER DEFAULT 0,
    available_points INTEGER DEFAULT 0,
    pending_points INTEGER DEFAULT 0,
    membership_level TEXT DEFAULT 'عضو جديد',
    is_pro BOOLEAN DEFAULT FALSE,
    pro_badge_earned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- إنشاء جدول بلاغات المستخدم (User Reports)
CREATE TABLE IF NOT EXISTS user_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    problem_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    estimated_points INTEGER DEFAULT 0,
    actual_points INTEGER,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    rejection_reason TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- إنشاء جدول سجل نشاطات المكافآت (Reward Activity Logs)
CREATE TABLE IF NOT EXISTS reward_activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL, -- 'report_submitted', 'report_approved', 'report_rejected'
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- تفعيل RLS للجداول الجديدة
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_activity_logs ENABLE ROW LEVEL SECURITY;

-- سياسات جدول المحفظة
CREATE POLICY "Users can view their own wallet" ON user_wallets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all wallets" ON user_wallets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- سياسات جدول البلاغات
CREATE POLICY "Users can view their own reports" ON user_reports
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own reports" ON user_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all reports" ON user_reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Admins can update reports" ON user_reports
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- سياسات جدول سجل النشاطات
CREATE POLICY "Users can view their own reward logs" ON reward_activity_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all reward logs" ON reward_activity_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- تفعيل Realtime
-- ALTER PUBLICATION supabase_realtime ADD TABLE user_wallets;
-- ALTER PUBLICATION supabase_realtime ADD TABLE user_reports;
