alter table inspections add column if not exists assigned_to_user_id text references users(id);
alter table inspections add column if not exists version integer not null default 1;

alter table vehicle_photos add column if not exists operation_id text;
alter table vehicle_photos add column if not exists captured_at timestamptz;
alter table vehicle_photos add column if not exists device_id text;
alter table vehicle_photos add column if not exists capture_source text not null default 'web';

alter table vision_suggestions add column if not exists version integer not null default 1;

alter table final_reports add column if not exists approval_status text not null default 'draft';
alter table final_reports add column if not exists reviewer_comment text not null default '';
alter table final_reports add column if not exists approved_by text references users(id);
alter table final_reports add column if not exists approved_at timestamptz;

create table if not exists domain_events (
  id text primary key,
  event_type text not null,
  schema_version text not null default '1.0',
  inspection_id text not null references inspections(id) on delete cascade,
  actor_id text not null,
  actor_role text not null check (actor_role in ('inspector', 'reviewer', 'admin')),
  correlation_id text not null,
  payload_json jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists idx_inspections_assigned_to on inspections(assigned_to_user_id, updated_at desc);
create unique index if not exists idx_vehicle_photos_operation_id on vehicle_photos(operation_id) where operation_id is not null;
create index if not exists idx_domain_events_status_created on domain_events(status, created_at);
create index if not exists idx_domain_events_inspection_created on domain_events(inspection_id, created_at);
