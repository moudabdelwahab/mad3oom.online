-- Forum Functions for mad3oom.online

-- Function to increment thread views
CREATE OR REPLACE FUNCTION increment_thread_views(thread_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE forum_threads
    SET views_count = views_count + 1
    WHERE id = thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle forum search with indexing
CREATE OR REPLACE FUNCTION search_forum_threads(search_query TEXT)
RETURNS SETOF forum_threads AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM forum_threads
    WHERE 
        to_tsvector('arabic', title || ' ' || content) @@ to_tsquery('arabic', search_query)
        OR title ILIKE '%' || search_query || '%'
        OR content ILIKE '%' || search_query || '%'
    ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle notifications on new reply
CREATE OR REPLACE FUNCTION notify_on_reply()
RETURNS TRIGGER AS $$
DECLARE
    thread_author_id UUID;
BEGIN
    -- Get thread author
    SELECT author_id INTO thread_author_id FROM forum_threads WHERE id = NEW.thread_id;
    
    -- Notify author if they are not the replier
    IF thread_author_id != NEW.author_id THEN
        INSERT INTO forum_notifications (user_id, type, thread_id, reply_id, actor_id)
        VALUES (thread_author_id, 'reply', NEW.thread_id, NEW.id, NEW.author_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_notify_on_reply AFTER INSERT ON forum_replies FOR EACH ROW EXECUTE FUNCTION notify_on_reply();

-- Function to handle mentions in content
CREATE OR REPLACE FUNCTION process_mentions()
RETURNS TRIGGER AS $$
DECLARE
    mention_username TEXT;
    mentioned_user_id UUID;
BEGIN
    -- Simple regex to find @username
    FOR mention_username IN SELECT unnest(regexp_matches(NEW.content, '@([a-zA-Z0-9_]+)', 'g')) LOOP
        -- Find user by username (assuming username is stored in profiles or metadata)
        -- For this system, we'll look in profiles.full_name (simplified)
        SELECT id INTO mentioned_user_id FROM profiles WHERE full_name ILIKE mention_username LIMIT 1;
        
        IF mentioned_user_id IS NOT NULL AND mentioned_user_id != NEW.author_id THEN
            INSERT INTO forum_notifications (user_id, type, thread_id, reply_id, actor_id)
            VALUES (mentioned_user_id, 'mention', NEW.thread_id, NEW.id, NEW.author_id);
            
            INSERT INTO forum_mentions (user_id, thread_id, reply_id)
            VALUES (mentioned_user_id, NEW.thread_id, NEW.id);
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_process_mentions AFTER INSERT ON forum_replies FOR EACH ROW EXECUTE FUNCTION process_mentions();
CREATE TRIGGER tr_process_thread_mentions AFTER INSERT ON forum_threads FOR EACH ROW EXECUTE FUNCTION process_mentions();
