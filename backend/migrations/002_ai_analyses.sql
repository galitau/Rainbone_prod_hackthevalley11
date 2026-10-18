-- AI audit log: one row per AI answer that POST /api/risk-analysis or POST /api/explain produced.
--
-- Requires TimescaleDB, like 001. Every statement is idempotent, so `python -m services.history migrate`
-- (which applies every file in this folder in name order) can be re-run safely. Nothing here runs at API start.
--
--   * ai_analyses is a hypertable on `time` (7-day chunks).
--   * A row holds what produced the answer (provider, model, the fallbacks taken before it), how long it took,
--     where its facts were read from (grounding_store: vultr-object-storage or local-backup) and the sha256 of
--     the facts and of the text. The text itself and the facts are not stored, and neither are keys or URLs.
--   * Only answers a model or the template produced are logged; an answer the API kept and served again
--     (risk-analysis reuses an AI answer for the same case and facts) is not logged a second time.
--   * No retention or compression policy: rows are kept until deleted by hand.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS ai_analyses (
  time            timestamptz NOT NULL DEFAULT now(),
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  endpoint        text NOT NULL,
  case_id         text,
  provider        text NOT NULL,
  model           text,
  facts_sha256    text NOT NULL CHECK (facts_sha256 ~ '^[0-9a-f]{64}$'),
  text_sha256     text NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
  latency_ms      double precision CHECK (latency_ms >= 0),
  grounding_store text,
  fallbacks       jsonb NOT NULL DEFAULT '[]'::jsonb
);

SELECT create_hypertable('ai_analyses', by_range('time', INTERVAL '7 days'), if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS ai_analyses_endpoint_time ON ai_analyses (endpoint, time DESC);
