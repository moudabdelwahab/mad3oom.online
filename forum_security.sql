-- Forum Security and Rate Limiting

-- 1. Rate Limiting Function
CREATE OR REPLACE FUNCTION check_forum_rate_limit(user_id UUID, action_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    recent_count INTEGER;
    limit_count INTEGER;
    time_window INTERVAL;
BEGIN
    -- Define limits
    IF action_type = 'thread' THEN
        limit_count := 5; -- 5 threads per hour
        time_window := INTERVAL '1 hour';
    ELSIF action_type = 'reply' THEN
        limit_count := 20; -- 20 replies per hour
        time_window := INTERVAL '1 hour';
    ELSE
        RETURN TRUE;
    END IF;

    -- Count recent actions
    IF action_type = 'thread' THEN
        SELECT COUNT(*) INTO recent_count FROM forum_threads 
        WHERE author_id = user_id AND created_at > NOW() - time_window;
    ELSIF action_type = 'reply' THEN
        SELECT COUNT(*) INTO recent_count FROM forum_replies 
        WHERE author_id = user_id AND created_at > NOW() - time_window;
    END IF;

    RETURN recent_count < limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Profanity Filter (Simple example, can be expanded)
CREATE OR REPLACE FUNCTION filter_profanity(content TEXT)
RETURNS TEXT AS $$
DECLARE
    bad_words TEXT[] := ARRAY['كلمة1', 'كلمة2', 'كلمة3']; -- Replace with actual list
    word TEXT;
BEGIN
    FOREACH word IN ARRAY bad_words LOOP
        content := regexp_replace(content, word, '***', 'gi');
    END LOOP;
    RETURN content;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Trigger to apply filtering before insert
CREATE OR REPLACE FUNCTION forum_content_sanitization()
RETURNS TRIGGER AS $$
BEGIN
    NEW.content := filter_profanity(NEW.content);
    IF TG_TABLE_NAME = 'forum_threads' THEN
        NEW.title := filter_profanity(NEW.title);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_sanitize_thread BEFORE INSERT OR UPDATE ON forum_threads FOR EACH ROW EXECUTE FUNCTION forum_content_sanitization();
CREATE TRIGGER tr_sanitize_reply BEFORE INSERT OR UPDATE ON forum_replies FOR EACH ROW EXECUTE FUNCTION forum_content_sanitization();

-- 4. Anti-spam: Review first post of new users
-- This can be handled by setting a flag in profiles or a separate table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS forum_posts_count INTEGER DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_user_post_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE profiles SET forum_posts_count = forum_posts_count + 1 WHERE id = NEW.author_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_inc_post_count AFTER INSERT ON forum_threads FOR EACH ROW EXECUTE FUNCTION increment_user_post_count();
CREATE TRIGGER tr_inc_reply_post_count AFTER INSERT ON forum_replies FOR EACH ROW EXECUTE FUNCTION increment_user_post_count();
