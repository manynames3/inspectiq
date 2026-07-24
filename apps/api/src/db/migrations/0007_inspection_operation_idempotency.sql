alter table damage_items
  add column if not exists idempotency_key text;

alter table condition_grades
  add column if not exists idempotency_key text;

create unique index if not exists idx_damage_idempotency
  on damage_items(inspection_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists idx_condition_grades_idempotency
  on condition_grades(inspection_id, idempotency_key)
  where idempotency_key is not null;
