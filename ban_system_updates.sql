-- إضافة أعمدة الحظر لجدول profiles
DO $$ 
BEGIN 
    -- حالة الحظر: 'none', 'temporary', 'permanent'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='ban_status') THEN
        ALTER TABLE profiles ADD COLUMN ban_status TEXT DEFAULT 'none';
    END IF;

    -- تاريخ انتهاء الحظر المؤقت
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='ban_until') THEN
        ALTER TABLE profiles ADD COLUMN ban_until TIMESTAMPTZ;
    END IF;

    -- سبب الحظر
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='ban_reason') THEN
        ALTER TABLE profiles ADD COLUMN ban_reason TEXT;
    END IF;
END $$;

-- تحديث سياسات RLS لجدول profiles للسماح للأدمن بتحديث بيانات المستخدمين الآخرين
-- ملاحظة: نفترض وجود سياسة سابقة تسمح للمستخدم بتحديث ملفه الشخصي فقط
-- سنضيف سياسة تسمح للأدمن بالتحكم الكامل

DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles" ON profiles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );
