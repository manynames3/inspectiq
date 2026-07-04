create extension if not exists "pgcrypto";

create table if not exists users (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  role text not null check (role in ('inspector', 'reviewer', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists inspections (
  id text primary key default gen_random_uuid()::text,
  vin text not null,
  year integer not null,
  make text not null,
  model text not null,
  trim text not null default '',
  mileage integer not null,
  exterior_color text not null,
  seller_source text not null,
  inspector_name text not null,
  status text not null check (status in ('DRAFT', 'NEEDS_PHOTOS', 'READY_FOR_GRADING', 'GRADED', 'AI_DRAFT_PENDING', 'AI_DRAFTED', 'HUMAN_REVIEW_REQUIRED', 'FINALIZED', 'REPORT_FAILED')),
  completeness_percentage integer not null default 0,
  created_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table if not exists vehicle_photos (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  storage_key text not null,
  object_bucket text,
  object_key text,
  thumbnail_storage_key text,
  byte_size integer check (byte_size is null or byte_size > 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~* '^([a-f0-9]{64}|[A-Za-z0-9+/]{43}=)$'),
  original_filename text not null,
  mime_type text not null,
  uploaded_by text references users(id),
  uploaded_at timestamptz not null default now(),
  upload_status text not null default 'uploaded' check (upload_status in ('pending', 'uploaded', 'failed')),
  declared_angle text,
  detected_angle text,
  detected_angle_confidence numeric,
  quality_status text not null default 'unknown' check (quality_status in ('unknown', 'ok', 'warning', 'fail')),
  analysis_status text not null default 'not_analyzed' check (analysis_status in ('not_analyzed', 'pending', 'completed', 'failed'))
);

alter table vehicle_photos add column if not exists object_bucket text;
alter table vehicle_photos add column if not exists object_key text;
alter table vehicle_photos add column if not exists thumbnail_storage_key text;
alter table vehicle_photos add column if not exists byte_size integer;
alter table vehicle_photos add column if not exists checksum_sha256 text;
alter table vehicle_photos add column if not exists upload_status text not null default 'uploaded';
alter table vehicle_photos drop constraint if exists vehicle_photos_checksum_sha256_check;
alter table vehicle_photos add constraint vehicle_photos_checksum_sha256_check check (checksum_sha256 is null or checksum_sha256 ~* '^([a-f0-9]{64}|[A-Za-z0-9+/]{43}=)$');

create table if not exists image_analysis_jobs (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  photo_id text not null references vehicle_photos(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'dead_letter')),
  idempotency_key text,
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  queued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists photo_analysis_results (
  id text primary key default gen_random_uuid()::text,
  photo_id text not null references vehicle_photos(id) on delete cascade,
  provider text not null,
  prompt_version text not null,
  raw_model_output_json jsonb,
  validated_output_json jsonb,
  confidence numeric not null default 0,
  status text not null check (status in ('completed', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists vision_suggestions (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  photo_id text not null references vehicle_photos(id) on delete cascade,
  suggestion_type text not null,
  suggested_value_json jsonb not null,
  confidence numeric not null,
  explanation text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'edited')),
  reviewed_by text references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists damage_items (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  photo_id text references vehicle_photos(id),
  location text not null,
  damage_type text not null,
  severity text not null,
  notes text not null default '',
  source text not null check (source in ('manual', 'vision_suggestion')),
  confirmed_by text references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists condition_grades (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  score integer not null,
  grade text not null check (grade in ('A', 'B', 'C', 'D', 'F')),
  explanation_json jsonb not null,
  grading_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists ai_report_jobs (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  idempotency_key text,
  error_message text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_report_drafts (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  job_id text not null references ai_report_jobs(id),
  provider text not null,
  prompt_version text not null,
  input_summary_json jsonb not null,
  output_json jsonb not null,
  confidence numeric not null,
  human_review_required boolean not null,
  validation_status text not null check (validation_status in ('valid', 'invalid')),
  created_at timestamptz not null default now()
);

create table if not exists final_reports (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  report_body text not null,
  finalized_by text references users(id),
  finalized_at timestamptz,
  version integer not null default 1
);

create table if not exists audit_events (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  actor text not null,
  event_type text not null,
  details_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inspections_status on inspections(status);
create index if not exists idx_inspections_updated_at on inspections(updated_at desc);
create index if not exists idx_inspections_created_by on inspections(created_by);
create index if not exists idx_vehicle_photos_inspection_id on vehicle_photos(inspection_id);
create index if not exists idx_vehicle_photos_uploaded_by on vehicle_photos(uploaded_by);
create index if not exists idx_vehicle_photos_analysis_status on vehicle_photos(analysis_status);
create index if not exists idx_image_analysis_jobs_photo_status on image_analysis_jobs(photo_id, status);
create index if not exists idx_image_analysis_jobs_inspection_status on image_analysis_jobs(inspection_id, status);
create index if not exists idx_image_analysis_jobs_status_updated on image_analysis_jobs(status, updated_at);
create index if not exists idx_photo_analysis_photo_id on photo_analysis_results(photo_id);
create index if not exists idx_suggestions_inspection_status on vision_suggestions(inspection_id, status);
create index if not exists idx_suggestions_photo_id on vision_suggestions(photo_id);
create index if not exists idx_suggestions_reviewed_by on vision_suggestions(reviewed_by);
create index if not exists idx_damage_inspection_id on damage_items(inspection_id);
create index if not exists idx_damage_photo_id on damage_items(photo_id);
create index if not exists idx_damage_confirmed_by on damage_items(confirmed_by);
create index if not exists idx_condition_grades_inspection_id on condition_grades(inspection_id);
create index if not exists idx_report_jobs_inspection_status on ai_report_jobs(inspection_id, status);
create unique index if not exists idx_report_jobs_idempotency on ai_report_jobs(inspection_id, idempotency_key) where idempotency_key is not null;
create index if not exists idx_report_drafts_inspection_id on ai_report_drafts(inspection_id);
create index if not exists idx_report_drafts_job_id on ai_report_drafts(job_id);
create index if not exists idx_final_reports_inspection_id on final_reports(inspection_id);
create index if not exists idx_audit_inspection_created on audit_events(inspection_id, created_at);
