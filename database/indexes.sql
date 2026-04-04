-- =============================================================================
-- AtmoInsight Hub — Performance Indexes
-- Run once against your Neon database to speed up Alerts and Disasters pages.
--
-- Apply:
--   psql $DATABASE_URL -f database/indexes.sql
--
-- All index creates use IF NOT EXISTS — safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ALERT table
-- The /api/alerts/active query filters on is_active and orders by timestamp.
-- A partial index on active-only rows keeps it tiny and fast.
-- ---------------------------------------------------------------------------

-- Partial index: only active alerts (the common case)
CREATE INDEX IF NOT EXISTS idx_alert_active_timestamp
    ON alert (timestamp DESC)
    WHERE is_active = true;

-- Index for reading/type lookup on active alerts (live schema: no sensor_id on alert)
CREATE INDEX IF NOT EXISTS idx_alert_reading_type
    ON alert (reading_id, alert_type_id)
    WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- READING table
-- The alert trigger fires per-row on INSERT and does several subqueries
-- back into reading.  The existing idx_reading_sensor_timestamp covers most,
-- but we add a composite on (measurement_type_id, timestamp) for the
-- duplicate-guard in openAQService and the timeseries endpoint.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_reading_type_timestamp
    ON reading (measurement_type_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_reading_sensor_type_ts
    ON reading (sensor_id, measurement_type_id, timestamp DESC);

-- ---------------------------------------------------------------------------
-- DISASTEREVENT table
-- The /api/disasters list orders by start_timestamp DESC with no filter;
-- the trigger dedup also queries this column within a 12-hour window.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_disasterevent_start_desc
    ON disasterevent (start_timestamp DESC);

-- Trigger dedup: (disaster_type_id, location_id, start_timestamp)
CREATE INDEX IF NOT EXISTS idx_disasterevent_type_loc_ts
    ON disasterevent (disaster_type_id, location_id, start_timestamp DESC);

-- ---------------------------------------------------------------------------
-- DISASTERIMPACT table
-- LEFT JOIN on event_id in every disaster query — needs an index.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_disasterimpact_event
    ON disasterimpact (event_id);

-- ---------------------------------------------------------------------------
-- ALERTTHRESHOLD table
-- The trigger does EXISTS on measurement_type_id for every reading insert.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_alertthreshold_measurement
    ON alertthreshold (measurement_type_id);

-- =============================================================================
-- End of indexes.sql
-- =============================================================================
