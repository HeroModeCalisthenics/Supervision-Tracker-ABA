alter table public.fieldwork_entries
  add column if not exists supervision_start_time time,
  add column if not exists supervision_end_time time,
  add column if not exists supervised_hours numeric(6,2) not null default 0 check (supervised_hours >= 0),
  add column if not exists individual_supervision_hours numeric(6,2) not null default 0 check (individual_supervision_hours >= 0),
  add column if not exists group_supervision_hours numeric(6,2) not null default 0 check (group_supervision_hours >= 0);

update public.fieldwork_entries
set
  supervision_start_time = case when experience_type = 'Supervised' then start_time else supervision_start_time end,
  supervision_end_time = case when experience_type = 'Supervised' then end_time else supervision_end_time end,
  supervised_hours = case when experience_type = 'Supervised' then duration_hours else supervised_hours end,
  individual_supervision_hours = case when experience_type = 'Supervised' and supervision_type = 'Individual' then duration_hours else individual_supervision_hours end,
  group_supervision_hours = case when experience_type = 'Supervised' and supervision_type = 'Group' then duration_hours else group_supervision_hours end
where supervised_hours = 0;
