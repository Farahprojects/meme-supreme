-- Add updated_at column if it does not exist
alter table public.memeroast_images
  add column if not exists updated_at timestamp with time zone not null default now();

-- Change the default status from 'pending' to 'processing'
alter table public.memeroast_images
  alter column status set default 'processing';

-- (Optional) If we wanted to enforce strict enum we would add a constraint,
-- but a simple text check constraint suffices if needed.
-- We will just check if we can add a simple check constraint for the status.
alter table public.memeroast_images
  drop constraint if exists memeroast_images_status_check;

-- Clean up any obsolete statuses (like processing_overlay) to satisfy constraint
update public.memeroast_images set status = 'processing' 
where status not in ('processing', 'complete', 'failed', 'pending');

alter table public.memeroast_images
  add constraint memeroast_images_status_check check (status in ('processing', 'complete', 'failed', 'pending'));
