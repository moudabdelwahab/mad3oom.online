-- تفعيل التحديث اللحظي (Realtime) لجداول المحادثات
-- هذا الكود يجب تنفيذه في SQL Editor الخاص بـ Supabase

-- 1. إضافة الجداول إلى منشور supabase_realtime
begin;
  -- إزالة الجداول إذا كانت موجودة مسبقاً لتجنب التكرار
  alter publication supabase_realtime drop table if exists chat_sessions;
  alter publication supabase_realtime drop table if exists chat_messages;

  -- إضافة الجداول
  alter publication supabase_realtime add table chat_sessions;
  alter publication supabase_realtime add table chat_messages;
commit;

-- 2. التأكد من أن الجداول لديها REPLICA IDENTITY FULL لضمان وصول كافة البيانات في التحديثات
alter table chat_sessions replica identity full;
alter table chat_messages replica identity full;
