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
  alter publication supabase_realtime add table profiles;
  alter publication supabase_realtime add table notifications;
  alter publication supabase_realtime add table tickets;
  alter publication supabase_realtime add table ticket_replies;
  alter publication supabase_realtime add table user_wallets;
  alter publication supabase_realtime add table user_reports;
  alter publication supabase_realtime add table activity_logs;
  alter publication supabase_realtime add table bot_api_keys;
  alter publication supabase_realtime add table trusted_devices;
commit;

-- 2. التأكد من أن الجداول لديها REPLICA IDENTITY FULL لضمان وصول كافة البيانات في التحديثات
alter table chat_sessions replica identity full;
alter table chat_messages replica identity full;
alter table profiles replica identity full;
alter table notifications replica identity full;
alter table tickets replica identity full;
alter table ticket_replies replica identity full;
alter table user_wallets replica identity full;
alter table user_reports replica identity full;
alter table activity_logs replica identity full;
alter table bot_api_keys replica identity full;
alter table trusted_devices replica identity full;
