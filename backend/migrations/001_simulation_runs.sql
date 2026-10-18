-- Simulation history: one row per successful POST /api/simulate.
--
-- Requires TimescaleDB (a Tiger Cloud service or the timescale/timescaledb image). Every statement is
-- idempotent, so `python -m services.history migrate` can be re-run safely. Nothing here runs at API start.
--
--   * simulation_runs is a hypertable on `time` (7-day chunks). Its metric columns are the
--     SimulationResponse fields, stored exactly as the API returned them; solver_* columns record
--     which code produced them and how long the call took.
--   * simulation_runs_hourly is a real-time continuous aggregate (materialized_only = false): the average
--     and maximum of max_von_mises_stress_mpa per hour. A refresh policy materializes buckets older than
--     one hour; newer rows are read from the hypertable at query time.
--   * No retention or compression policy: history is kept until it is deleted by hand.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS simulation_runs (
  time                        timestamptz NOT NULL DEFAULT now(),
  run_id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  source_filename             text NOT NULL,
  max_von_mises_stress_mpa    double precision NOT NULL,
  average_youngs_modulus_gpa  double precision NOT NULL,
  bone_volume_cm3             double precision NOT NULL,
  fracture_risk_index_percent double precision NOT NULL
                              CHECK (fracture_risk_index_percent BETWEEN 0 AND 100),
  load_newtons                double precision NOT NULL,
  mesh_vertices               integer NOT NULL CHECK (mesh_vertices >= 0),
  mesh_faces                  integer NOT NULL CHECK (mesh_faces >= 0),
  solver                      text NOT NULL,
  solver_versions             jsonb NOT NULL DEFAULT '{}'::jsonb,
  solve_ms                    double precision CHECK (solve_ms >= 0)
);

SELECT create_hypertable('simulation_runs', by_range('time', INTERVAL '7 days'), if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS simulation_runs_source_time ON simulation_runs (source_filename, time DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS simulation_runs_hourly
  WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
  SELECT time_bucket(INTERVAL '1 hour', time) AS bucket,
         count(*) AS runs,
         avg(max_von_mises_stress_mpa) AS avg_max_von_mises_stress_mpa,
         max(max_von_mises_stress_mpa) AS max_max_von_mises_stress_mpa
    FROM simulation_runs
   GROUP BY time_bucket(INTERVAL '1 hour', time)
  WITH NO DATA;

SELECT add_continuous_aggregate_policy('simulation_runs_hourly',
                                       start_offset => INTERVAL '30 days',
                                       end_offset => INTERVAL '1 hour',
                                       schedule_interval => INTERVAL '1 hour',
                                       if_not_exists => TRUE);
