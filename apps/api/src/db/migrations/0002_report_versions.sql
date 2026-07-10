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

create index if not exists idx_report_versions_report_version on report_versions(report_id, version desc);
