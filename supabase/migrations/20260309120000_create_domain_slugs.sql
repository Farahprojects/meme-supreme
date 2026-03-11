-- Create the domain_slugs table identical to Therai's schema
CREATE TABLE IF NOT EXISTS public.domain_slugs (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    domain TEXT NOT NULL UNIQUE,
    info BOOLEAN DEFAULT false,
    media BOOLEAN DEFAULT false,
    billing BOOLEAN DEFAULT false,
    support BOOLEAN DEFAULT false,
    noreply BOOLEAN DEFAULT false,
    hello BOOLEAN DEFAULT false,
    contact BOOLEAN DEFAULT false,
    help BOOLEAN DEFAULT false,
    marketing BOOLEAN DEFAULT false,
    admin BOOLEAN DEFAULT false,
    legal BOOLEAN DEFAULT false,
    hr BOOLEAN DEFAULT false,
    dev BOOLEAN DEFAULT false,
    test BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.domain_slugs ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated and anon users (if needed by edge functions running as service_role, RLS is bypassed anyway)
CREATE POLICY "domain_slugs_select" ON public.domain_slugs FOR SELECT TO authenticated USING (true);
CREATE POLICY "domain_slugs_select_anon" ON public.domain_slugs FOR SELECT TO anon USING (true);

-- Insert memesupreme configuration
INSERT INTO public.domain_slugs (domain, info, noreply)
VALUES ('memesupreme.co', true, true)
ON CONFLICT (domain) DO UPDATE
SET info = EXCLUDED.info,
    noreply = EXCLUDED.noreply;
