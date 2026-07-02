create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('inspector', 'reviewer', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  vin text not null,
  year integer not null,
  make text not null,
  model text not null,
  trim text not null default '',
  mileage integer not null,
  exterior_color text not null,
  seller_source text not null,
  inspector_name text not null,
  status text not null,
  completeness_percentage integer not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

create table if not exists vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  storage_key text not null,
  original_filename text not null,
  mime_type text not null,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now(),
  declared_angle text,
  detected_angle text,
  detected_angle_confidence numeric,
  quality_status text not null default 'unknown',
  analysis_status text not null default 'not_analyzed'
);

create table if not exists photo_analysis_results (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references vehicle_photos(id) on delete cascade,
  provider text not null,
  prompt_version text not null,
  raw_model_output_json jsonb,
  validated_output_json jsonb,
  confidence numeric not null default 0,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists vision_suggestions (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  photo_id uuid not null references vehicle_photos(id) on delete cascade,
  suggestion_type text not null,
  suggested_value_json jsonb not null,
  confidence numeric not null,
  explanation text not null,
  status text not null default 'pending',
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists damage_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  photo_id uuid references vehicle_photos(id),
  location text not null,
  damage_type text not null,
  severity text not null,
  notes text not null default '',
  source text not null,
  confirmed_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists condition_grades (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  score integer not null,
  grade text not null,
  explanation_json jsonb not null,
  grading_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists ai_report_jobs (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  status text not null,
  idempotency_key text,
  error_message text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_report_drafts (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  job_id uuid not null references ai_report_jobs(id),
  provider text not null,
  prompt_version text not null,
  input_summary_json jsonb not null,
  output_json jsonb not null,
  confidence numeric not null,
  human_review_required boolean not null,
  validation_status text not null,
  created_at timestamptz not null default now()
);

create table if not exists final_reports (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  report_body text not null,
  finalized_by uuid references users(id),
  finalized_at timestamptz,
  version integer not null default 1
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  actor text not null,
  event_type text not null,
  details_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inspections_status on inspections(status);
create index if not exists idx_inspections_updated_at on inspections(updated_at desc);
create index if not exists idx_vehicle_photos_inspection_id on vehicle_photos(inspection_id);
create index if not exists idx_photo_analysis_photo_id on photo_analysis_results(photo_id);
create index if not exists idx_suggestions_inspection_status on vision_suggestions(inspection_id, status);
create index if not exists idx_damage_inspection_id on damage_items(inspection_id);
create index if not exists idx_report_jobs_inspection_status on ai_report_jobs(inspection_id, status);
create index if not exists idx_audit_inspection_created on audit_events(inspection_id, created_at);

