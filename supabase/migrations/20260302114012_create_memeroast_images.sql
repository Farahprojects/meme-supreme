create table if not exists public.memeroast_images (
    id uuid primary key default gen_random_uuid(),
    session_id text not null,
    product_type text not null,
    target_names text not null,
    context_description text not null,
    optional_sign text,
    generated_caption text,
    image_url text,
    status text not null default 'pending',
    source text not null default 'memeroast',
    payment_status text not null default 'pending',
    stripe_session_id text,
    created_at timestamp with time zone not null default now()
);

-- Replicate typical RLS for an API-accessed table
alter table public.memeroast_images enable row level security;

do $$
begin
    if not exists (select 1 from pg_policies where policyname = 'Enable insert for public' and tablename = 'memeroast_images') then
        create policy "Enable insert for public" on public.memeroast_images for insert to public with check (true);
    end if;

    if not exists (select 1 from pg_policies where policyname = 'Enable select for public' and tablename = 'memeroast_images') then
        create policy "Enable select for public" on public.memeroast_images for select to public using (true);
    end if;

    if not exists (select 1 from pg_policies where policyname = 'Enable update for public' and tablename = 'memeroast_images') then
        create policy "Enable update for public" on public.memeroast_images for update to public using (true);
    end if;
end $$;
