alter table public.profiles
  add column if not exists bacb_id text,
  add column if not exists fieldwork_state text,
  add column if not exists fieldwork_country text,
  add column if not exists trainee_signature_data_url text;

alter table public.supervisors
  add column if not exists bacb_id text;
