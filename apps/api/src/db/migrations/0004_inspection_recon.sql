alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (
  role in ('inspector', 'reviewer', 'recon_coordinator', 'consignor_approver', 'technician', 'admin')
);

alter table domain_events drop constraint if exists domain_events_actor_role_check;
alter table domain_events add constraint domain_events_actor_role_check check (
  actor_role in ('inspector', 'reviewer', 'recon_coordinator', 'consignor_approver', 'technician', 'admin')
);

alter table condition_grades add column if not exists suggested_grade numeric(2, 1);
alter table condition_grades add column if not exists approved_grade numeric(2, 1);
alter table condition_grades add column if not exists condition_grade_before_recon numeric(2, 1);
alter table condition_grades add column if not exists estimated_grade_after_recon numeric(2, 1);
alter table condition_grades add column if not exists reviewed_by text references users(id);
alter table condition_grades add column if not exists override_reason text;
alter table condition_grades add column if not exists evidence_blockers_json jsonb not null default '[]'::jsonb;
alter table condition_grades add column if not exists version integer not null default 1;
alter table condition_grades add column if not exists reviewed_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'condition_grades' and column_name = 'score'
  ) then
    execute '
      update condition_grades
      set suggested_grade = coalesce(suggested_grade, round((score::numeric / 20.0), 1)),
          approved_grade = coalesce(approved_grade, round((score::numeric / 20.0), 1)),
          condition_grade_before_recon = coalesce(condition_grade_before_recon, round((score::numeric / 20.0), 1)),
          estimated_grade_after_recon = coalesce(estimated_grade_after_recon, round((score::numeric / 20.0), 1)),
          reviewed_at = coalesce(reviewed_at, created_at)
    ';
    alter table condition_grades drop column score;
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_name = 'condition_grades' and column_name = 'grade'
  ) then
    alter table condition_grades drop column grade;
  end if;
end $$;

update condition_grades
set suggested_grade = coalesce(suggested_grade, 0.0),
    condition_grade_before_recon = coalesce(condition_grade_before_recon, suggested_grade, 0.0),
    estimated_grade_after_recon = coalesce(estimated_grade_after_recon, condition_grade_before_recon, suggested_grade, 0.0);

alter table condition_grades alter column suggested_grade set not null;
alter table condition_grades alter column condition_grade_before_recon set not null;
alter table condition_grades alter column estimated_grade_after_recon set not null;
alter table condition_grades add constraint condition_grades_suggested_range check (suggested_grade between 0 and 5);
alter table condition_grades add constraint condition_grades_approved_range check (approved_grade is null or approved_grade between 0 and 5);
alter table condition_grades add constraint condition_grades_before_recon_range check (condition_grade_before_recon between 0 and 5);
alter table condition_grades add constraint condition_grades_after_recon_range check (estimated_grade_after_recon between 0 and 5);

create table if not exists consignor_accounts (
  id text primary key,
  name text not null,
  account_type text not null check (account_type in ('DEALERSHIP', 'FLEET', 'RENTAL', 'BANK', 'LEASING', 'OEM_PROGRAM')),
  authorized_user_ids_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recon_authorization_policies (
  id text primary key,
  consignor_account_id text not null references consignor_accounts(id) on delete cascade,
  name text not null,
  approval_mode text not null check (approval_mode in ('MANUAL', 'AUTO_APPROVE_UNDER_LIMIT', 'MANAGED_PROGRAM', 'NO_RECON')),
  total_vehicle_limit numeric(12, 2) not null check (total_vehicle_limit >= 0),
  service_rules_json jsonb not null,
  cost_overrun_tolerance numeric(12, 2) not null check (cost_overrun_tolerance >= 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vehicle_intakes (
  id text primary key,
  inspection_id text not null unique references inspections(id) on delete cascade,
  consignor_account_id text not null references consignor_accounts(id),
  facility text not null,
  yard_zone text not null,
  parking_space text not null,
  last_location_timestamp timestamptz not null,
  inspection_type text not null check (inspection_type in ('VISUAL_CONDITION_REPORT', 'MECHANICAL_CERTIFICATION', 'POST_SALE')),
  inspection_workflow_status text not null check (inspection_workflow_status in ('ASSIGNED', 'CAPTURE_IN_PROGRESS', 'REVIEW_READY', 'RETAKE_REQUIRED', 'CR_PUBLISHED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inspection_assignments (
  id text primary key,
  inspection_id text not null references inspections(id) on delete cascade,
  assigned_to_user_id text not null references users(id),
  assigned_by_user_id text not null references users(id),
  due_at timestamptz not null,
  status text not null check (status in ('ASSIGNED', 'ACCEPTED', 'COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sale_assignments (
  id text primary key,
  inspection_id text not null unique references inspections(id) on delete cascade,
  sale_date_time timestamptz not null,
  lane text not null,
  run_number text not null,
  sale_event_id text,
  status text not null check (status in ('BLOCKED', 'READY', 'SCHEDULED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vehicle_location_events (
  id text primary key,
  inspection_id text not null references inspections(id) on delete cascade,
  facility text not null,
  yard_zone text not null,
  parking_space text not null,
  reason text not null,
  actor_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists recon_recommendations (
  id text primary key,
  inspection_id text not null references inspections(id) on delete cascade,
  damage_item_id text references damage_items(id),
  service_type text not null check (service_type in ('DETAIL', 'MECHANICAL', 'BODY', 'TIRE', 'GLASS', 'THIRD_PARTY')),
  recommended_action text not null,
  estimated_cost numeric(12, 2) not null check (estimated_cost >= 0),
  estimated_duration_hours numeric(10, 2) not null check (estimated_duration_hours > 0),
  expected_grade_lift numeric(2, 1) not null check (expected_grade_lift between 0 and 5),
  estimate_creator_id text not null references users(id),
  supporting_photo_ids_json jsonb not null default '[]'::jsonb,
  notes text not null default '',
  status text not null check (status in ('DRAFT', 'AUTHORIZATION_PENDING', 'AUTHORIZED', 'DECLINED', 'REAUTHORIZATION_REQUIRED')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recon_authorizations (
  id text primary key,
  inspection_id text not null references inspections(id) on delete cascade,
  recommendation_id text not null references recon_recommendations(id) on delete cascade,
  decision text not null check (decision in ('PENDING', 'AUTHORIZED', 'DECLINED', 'REVISION_REQUESTED')),
  authorized_amount numeric(12, 2) not null check (authorized_amount >= 0),
  authorization_source text check (authorization_source is null or authorization_source in ('CONSIGNOR_USER', 'CONSIGNOR_POLICY', 'MANAGED_PROGRAM_POLICY', 'ADMINISTRATIVE_OVERRIDE')),
  consignor_user_id text references users(id),
  policy_snapshot_json jsonb,
  decision_reason text not null,
  decision_timestamp timestamptz,
  expires_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists work_orders (
  id text primary key,
  work_order_number text not null unique,
  inspection_id text not null references inspections(id) on delete cascade,
  facility text not null,
  service_department text not null check (service_department in ('DETAIL', 'MECHANICAL', 'BODY', 'TIRE', 'GLASS', 'THIRD_PARTY')),
  authorized_amount numeric(12, 2) not null check (authorized_amount >= 0),
  current_estimated_cost numeric(12, 2) not null check (current_estimated_cost >= 0),
  actual_cost numeric(12, 2),
  assigned_technician text,
  instructions text not null,
  sale_deadline timestamptz not null,
  status text not null check (status in ('QUEUED', 'IN_PROGRESS', 'BLOCKED', 'QC_REQUIRED', 'COMPLETED')),
  blocked_reason text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists work_order_tasks (
  id text primary key,
  work_order_id text not null references work_orders(id) on delete cascade,
  recommendation_id text not null unique references recon_recommendations(id),
  description text not null,
  authorized_amount numeric(12, 2) not null check (authorized_amount >= 0),
  status text not null check (status in ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quality_control_results (
  id text primary key,
  work_order_id text not null references work_orders(id) on delete cascade,
  status text not null check (status in ('PENDING', 'PASSED', 'FAILED')),
  notes text not null,
  inspected_by_user_id text not null references users(id),
  inspected_at timestamptz not null
);

create table if not exists sale_readiness_assessments (
  id text primary key,
  inspection_id text not null references inspections(id) on delete cascade,
  sale_ready boolean not null,
  status text not null check (status in ('BLOCKED', 'READY', 'SCHEDULED')),
  blockers_json jsonb not null,
  assessed_by_user_id text not null,
  assessed_at timestamptz not null
);

create index if not exists idx_recon_policy_account on recon_authorization_policies(consignor_account_id, updated_at desc);
create index if not exists idx_vehicle_intake_facility on vehicle_intakes(facility, inspection_workflow_status);
create index if not exists idx_sale_assignment_deadline on sale_assignments(sale_date_time, status);
create index if not exists idx_recon_recommendation_inspection on recon_recommendations(inspection_id, status);
create index if not exists idx_recon_authorization_inspection on recon_authorizations(inspection_id, decision);
create index if not exists idx_work_order_queue on work_orders(facility, service_department, status, sale_deadline);
create index if not exists idx_qc_work_order on quality_control_results(work_order_id, inspected_at desc);
create index if not exists idx_sale_readiness_inspection on sale_readiness_assessments(inspection_id, assessed_at desc);
