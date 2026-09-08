-- Rename Twilio-specific column for SNS (and any future provider) message ids
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'twilio_sid'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'provider_message_id'
    ) THEN
        ALTER TABLE messages RENAME COLUMN twilio_sid TO provider_message_id;
    END IF;
END $$;
