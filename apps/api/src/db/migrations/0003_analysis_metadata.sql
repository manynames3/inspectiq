alter table photo_analysis_results add column if not exists model_id text;
alter table photo_analysis_results add column if not exists latency_ms integer;
alter table photo_analysis_results add column if not exists input_tokens integer;
alter table photo_analysis_results add column if not exists output_tokens integer;
alter table photo_analysis_results add column if not exists total_tokens integer;
alter table photo_analysis_results add column if not exists estimated_cost_usd numeric(12, 6);
alter table photo_analysis_results add column if not exists schema_valid boolean not null default true;
alter table photo_analysis_results add column if not exists fallback_used boolean not null default false;
alter table photo_analysis_results add column if not exists failure_category text;

create index if not exists photo_analysis_results_provider_created_idx
  on photo_analysis_results(provider, created_at desc);
