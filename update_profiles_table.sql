-- تحديث جدول profiles لإضافة الحقول الجديدة
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- تفعيل خاصية Realtime لجدول profiles
-- ملاحظة: قد يكون الجدول مضافاً بالفعل، لذا سنقوم بالتأكد
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    END IF;
END $$;

-- تعيين هوية النسخة المتماثلة إلى FULL لضمان وصول جميع البيانات في Realtime
ALTER TABLE profiles REPLICA IDENTITY FULL;

-- التأكد من تفعيل Realtime لجدول profiles بشكل صريح
ALTER TABLE profiles SET (realtime = true);

-- إضافة تعليق للتوضيح
COMMENT ON COLUMN profiles.username IS 'اسم مستخدم فريد لكل عميل';

-- دالة لإنشاء بروفايل تلقائياً عند تسجيل مستخدم جديد
-- تقوم بجلب البيانات من metadata التي أرسلناها أثناء signUp
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, username, role)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    new.raw_user_meta_data->>'username',
    'customer'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إنشاء Trigger لتنفيذ الدالة عند إنشاء مستخدم في auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

