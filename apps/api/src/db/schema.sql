create extension if not exists "pgcrypto";

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  role text not null check (role in ('inspector', 'reviewer', 'recon_coordinator', 'consignor_approver', 'technician', 'admin')),
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
  assigned_to_user_id text references users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz
);

alter table inspections add column if not exists assigned_to_user_id text references users(id);
alter table inspections add column if not exists version integer not null default 1;

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
  source_name text,
  source_url text,
  source_license text,
  uploaded_by text references users(id),
  uploaded_at timestamptz not null default now(),
  upload_status text not null default 'uploaded' check (upload_status in ('pending', 'uploaded', 'failed')),
  declared_angle text,
  detected_angle text,
  detected_angle_confidence numeric,
  quality_status text not null default 'unknown' check (quality_status in ('unknown', 'ok', 'warning', 'fail')),
  analysis_status text not null default 'not_analyzed' check (analysis_status in ('not_analyzed', 'pending', 'completed', 'failed'))
  ,operation_id text
  ,captured_at timestamptz
  ,device_id text
  ,capture_source text not null default 'web' check (capture_source in ('web', 'mobile', 'reference'))
);

alter table vehicle_photos add column if not exists object_bucket text;
alter table vehicle_photos add column if not exists object_key text;
alter table vehicle_photos add column if not exists thumbnail_storage_key text;
alter table vehicle_photos add column if not exists byte_size integer;
alter table vehicle_photos add column if not exists checksum_sha256 text;
alter table vehicle_photos add column if not exists source_name text;
alter table vehicle_photos add column if not exists source_url text;
alter table vehicle_photos add column if not exists source_license text;
alter table vehicle_photos add column if not exists upload_status text not null default 'uploaded';
alter table vehicle_photos add column if not exists operation_id text;
alter table vehicle_photos add column if not exists captured_at timestamptz;
alter table vehicle_photos add column if not exists device_id text;
alter table vehicle_photos add column if not exists capture_source text not null default 'web';
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
  model_id text,
  latency_ms integer,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(12, 6),
  schema_valid boolean not null default true,
  fallback_used boolean not null default false,
  failure_category text,
  created_at timestamptz not null default now()
);

create table if not exists vision_suggestions (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  photo_id text not null references vehicle_photos(id) on delete cascade,
  suggestion_type text not null,
  suggested_value_json jsonb not null,
  semantic_key text generated always as (
    case suggestion_type
      when 'photo_angle' then lower(btrim(coalesce(suggested_value_json ->> 'photoAngle', '')))
      when 'quality_warning' then lower(btrim(coalesce(suggested_value_json ->> 'warning', '')))
      when 'extracted_text' then
        upper(regexp_replace(coalesce(suggested_value_json ->> 'vin', ''), '[^a-zA-Z0-9]', '', 'g'))
        || ':' ||
        regexp_replace(coalesce(suggested_value_json ->> 'odometer', ''), '[^0-9]', '', 'g')
      when 'damage_candidate' then
        lower(btrim(coalesce(suggested_value_json ->> 'location', '')))
        || ':' ||
        lower(btrim(coalesce(suggested_value_json ->> 'damageType', '')))
        || ':' ||
        lower(btrim(coalesce(suggested_value_json ->> 'severityEstimate', '')))
      else suggested_value_json::text
    end
  ) stored,
  confidence numeric not null,
  explanation text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'edited')),
  assigned_to_role text not null default 'reviewer' check (assigned_to_role in ('inspector', 'reviewer')),
  assigned_to_user_id text references users(id),
  due_at timestamptz not null default now(),
  reviewed_by text references users(id),
  reviewed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

alter table vision_suggestions add column if not exists assigned_to_role text not null default 'reviewer';
alter table vision_suggestions add column if not exists assigned_to_user_id text references users(id);
alter table vision_suggestions add column if not exists due_at timestamptz not null default now();
alter table vision_suggestions add column if not exists resolved_at timestamptz;
alter table vision_suggestions add column if not exists version integer not null default 1;
alter table vision_suggestions
  add column if not exists semantic_key text generated always as (
    case suggestion_type
      when 'photo_angle' then lower(btrim(coalesce(suggested_value_json ->> 'photoAngle', '')))
      when 'quality_warning' then lower(btrim(coalesce(suggested_value_json ->> 'warning', '')))
      when 'extracted_text' then
        upper(regexp_replace(coalesce(suggested_value_json ->> 'vin', ''), '[^a-zA-Z0-9]', '', 'g'))
        || ':' ||
        regexp_replace(coalesce(suggested_value_json ->> 'odometer', ''), '[^0-9]', '', 'g')
      when 'damage_candidate' then
        lower(btrim(coalesce(suggested_value_json ->> 'location', '')))
        || ':' ||
        lower(btrim(coalesce(suggested_value_json ->> 'damageType', '')))
        || ':' ||
        lower(btrim(coalesce(suggested_value_json ->> 'severityEstimate', '')))
      else suggested_value_json::text
    end
  ) stored;
alter table vision_suggestions drop constraint if exists vision_suggestions_assigned_to_role_check;
alter table vision_suggestions add constraint vision_suggestions_assigned_to_role_check check (assigned_to_role in ('inspector', 'reviewer'));

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

create table if not exists identity_verifications (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  photo_id text not null references vehicle_photos(id) on delete cascade,
  field text not null check (field in ('vin', 'odometer')),
  value text not null,
  source_suggestion_id text not null references vision_suggestions(id) on delete cascade,
  verified_by text not null references users(id),
  verified_at timestamptz not null default now(),
  unique (inspection_id, field)
);

create table if not exists condition_grades (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  suggested_grade numeric(2, 1) not null check (suggested_grade between 0 and 5),
  approved_grade numeric(2, 1) check (approved_grade is null or approved_grade between 0 and 5),
  condition_grade_before_recon numeric(2, 1) not null check (condition_grade_before_recon between 0 and 5),
  estimated_grade_after_recon numeric(2, 1) not null check (estimated_grade_after_recon between 0 and 5),
  reviewed_by text references users(id),
  override_reason text,
  evidence_blockers_json jsonb not null default '[]'::jsonb,
  explanation_json jsonb not null,
  grading_version text not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
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
  version integer not null default 1,
  approval_status text not null default 'draft' check (approval_status in ('draft', 'in_review', 'approved', 'finalized')),
  reviewer_comment text not null default '',
  approved_by text references users(id),
  approved_at timestamptz
);

alter table final_reports add column if not exists approval_status text not null default 'draft';
alter table final_reports add column if not exists reviewer_comment text not null default '';
alter table final_reports add column if not exists approved_by text references users(id);
alter table final_reports add column if not exists approved_at timestamptz;

create table if not exists report_versions (
  id text primary key,
  report_id text not null references final_reports(id) on delete cascade,
  inspection_id text not null references inspections(id) on delete cascade,
  version integer not null,
  report_body text not null,
  approval_status text not null check (approval_status in ('draft', 'in_review', 'approved', 'finalized')),
  reviewer_comment text not null default '',
  changed_by text not null references users(id),
  change_type text not null check (change_type in ('generated', 'edited', 'approved', 'finalized')),
  created_at timestamptz not null default now(),
  unique (report_id, version)
);

create table if not exists audit_events (
  id text primary key default gen_random_uuid()::text,
  inspection_id text not null references inspections(id) on delete cascade,
  actor text not null,
  event_type text not null,
  details_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists domain_events (
  id text primary key,
  event_type text not null,
  schema_version text not null default '1.0',
  inspection_id text not null references inspections(id) on delete cascade,
  actor_id text not null,
  actor_role text not null check (actor_role in ('inspector', 'reviewer', 'recon_coordinator', 'consignor_approver', 'technician', 'admin')),
  correlation_id text not null,
  payload_json jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists idx_inspections_status on inspections(status);
create index if not exists idx_inspections_updated_at on inspections(updated_at desc);
create index if not exists idx_inspections_created_by on inspections(created_by);
create index if not exists idx_inspections_assigned_to on inspections(assigned_to_user_id, updated_at desc);
create index if not exists idx_vehicle_photos_inspection_id on vehicle_photos(inspection_id);
create index if not exists idx_vehicle_photos_uploaded_by on vehicle_photos(uploaded_by);
create index if not exists idx_vehicle_photos_analysis_status on vehicle_photos(analysis_status);
create unique index if not exists idx_vehicle_photos_operation_id on vehicle_photos(operation_id) where operation_id is not null;
create index if not exists idx_image_analysis_jobs_photo_status on image_analysis_jobs(photo_id, status);
create index if not exists idx_image_analysis_jobs_inspection_status on image_analysis_jobs(inspection_id, status);
create index if not exists idx_image_analysis_jobs_status_updated on image_analysis_jobs(status, updated_at);
create index if not exists idx_photo_analysis_photo_id on photo_analysis_results(photo_id);
create index if not exists idx_suggestions_inspection_status on vision_suggestions(inspection_id, status);
create index if not exists idx_suggestions_photo_id on vision_suggestions(photo_id);
create index if not exists idx_suggestions_assigned_due on vision_suggestions(assigned_to_role, due_at);
create index if not exists idx_suggestions_reviewed_by on vision_suggestions(reviewed_by);
create index if not exists idx_damage_inspection_id on damage_items(inspection_id);
create index if not exists idx_damage_photo_id on damage_items(photo_id);
create index if not exists idx_damage_confirmed_by on damage_items(confirmed_by);
create index if not exists idx_identity_verifications_inspection_id on identity_verifications(inspection_id);
create index if not exists idx_identity_verifications_photo_id on identity_verifications(photo_id);
create index if not exists idx_identity_verifications_source_suggestion on identity_verifications(source_suggestion_id);
create index if not exists idx_condition_grades_inspection_id on condition_grades(inspection_id);
create index if not exists idx_report_jobs_inspection_status on ai_report_jobs(inspection_id, status);
create unique index if not exists idx_report_jobs_idempotency on ai_report_jobs(inspection_id, idempotency_key) where idempotency_key is not null;
create index if not exists idx_report_drafts_inspection_id on ai_report_drafts(inspection_id);
create index if not exists idx_report_drafts_job_id on ai_report_drafts(job_id);
create index if not exists idx_final_reports_inspection_id on final_reports(inspection_id);
create index if not exists idx_report_versions_report_version on report_versions(report_id, version desc);
create index if not exists idx_audit_inspection_created on audit_events(inspection_id, created_at);
create index if not exists idx_domain_events_status_created on domain_events(status, created_at);
create index if not exists idx_domain_events_inspection_created on domain_events(inspection_id, created_at);
