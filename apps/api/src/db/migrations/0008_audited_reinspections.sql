alter table inspections
  add column if not exists reinspection_source_inspection_id text references inspections(id),
  add column if not exists reinspection_source_report_id text references final_reports(id),
  add column if not exists reinspection_source_report_version integer,
  add column if not exists reinspection_reason text,
  add column if not exists reinspection_operation_id uuid;

create unique index if not exists idx_inspections_reinspection_operation
  on inspections(reinspection_source_inspection_id, reinspection_operation_id);
