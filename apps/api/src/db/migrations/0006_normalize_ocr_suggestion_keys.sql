drop index if exists idx_suggestions_photo_semantic;

alter table vision_suggestions drop column semantic_key;
alter table vision_suggestions
  add column semantic_key text generated always as (
    case suggestion_type
      when 'photo_angle' then lower(btrim(coalesce(suggested_value_json ->> 'photoAngle', '')))
      when 'quality_warning' then lower(btrim(coalesce(suggested_value_json ->> 'warning', '')))
      when 'extracted_text' then
        upper(regexp_replace(coalesce(suggested_value_json ->> 'vin', ''), '[^a-zA-Z0-9]', '', 'g'))
        || ':' ||
        coalesce((
          nullif(regexp_replace(coalesce(suggested_value_json ->> 'odometer', ''), '[^0-9]', '', 'g'), '')::bigint
        )::text, '')
      when 'damage_candidate' then
        lower(btrim(coalesce(suggested_value_json ->> 'location', '')))
        || ':' ||
        lower(btrim(coalesce(suggested_value_json ->> 'damageType', '')))
        || ':' ||
        lower(btrim(coalesce(suggested_value_json ->> 'severityEstimate', '')))
      else suggested_value_json::text
    end
  ) stored;

create temporary table duplicate_vision_suggestions_v2 on commit drop as
with ranked as (
  select
    id,
    inspection_id,
    first_value(id) over (
      partition by photo_id, suggestion_type, semantic_key
      order by
        case status
          when 'accepted' then 4
          when 'rejected' then 4
          when 'edited' then 3
          else 2
        end desc,
        case
          when status in ('accepted', 'rejected', 'edited')
            then coalesce(resolved_at, reviewed_at, created_at)
          else null
        end desc nulls last,
        created_at asc,
        id asc
    ) as keep_id,
    row_number() over (
      partition by photo_id, suggestion_type, semantic_key
      order by
        case status
          when 'accepted' then 4
          when 'rejected' then 4
          when 'edited' then 3
          else 2
        end desc,
        case
          when status in ('accepted', 'rejected', 'edited')
            then coalesce(resolved_at, reviewed_at, created_at)
          else null
        end desc nulls last,
        created_at asc,
        id asc
    ) as duplicate_rank
  from vision_suggestions
)
select id, keep_id, inspection_id
from ranked
where duplicate_rank > 1;

update identity_verifications verification
set source_suggestion_id = duplicate.keep_id
from duplicate_vision_suggestions_v2 duplicate
where verification.source_suggestion_id = duplicate.id;

insert into audit_events (id, inspection_id, actor, event_type, details_json, created_at)
select
  gen_random_uuid()::text,
  duplicate.inspection_id,
  '{"id":"system-migration","name":"Suggestion reconciliation","role":"admin"}',
  'suggestion.duplicates_reconciled',
  jsonb_build_object(
    'removedSuggestionIds', jsonb_agg(duplicate.id order by duplicate.id),
    'reason', 'Equivalent OCR readings created more than one review finding for one photo.'
  ),
  now()
from duplicate_vision_suggestions_v2 duplicate
group by duplicate.inspection_id;

delete from vision_suggestions suggestion
using duplicate_vision_suggestions_v2 duplicate
where suggestion.id = duplicate.id;

create unique index idx_suggestions_photo_semantic
  on vision_suggestions(photo_id, suggestion_type, semantic_key);
