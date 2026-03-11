CREATE TABLE IF NOT EXISTS public.email_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subject TEXT,
    body TEXT,
    from_address TEXT,
    to_address TEXT,
    direction TEXT,
    sent_via TEXT,
    is_read BOOLEAN DEFAULT true,
    is_starred BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    raw_headers JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS but allow service_role to bypass it
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
