-- Drop view if it exists
DROP MATERIALIZED VIEW IF EXISTS daily_sensor_averages CASCADE;

-- Create the Materialized View
-- We use date_trunc('day', timestamp) to group readings into a single 24-hour block
CREATE MATERIALIZED VIEW daily_sensor_averages AS
SELECT 
  sensor_id,
  DATE_TRUNC('day', timestamp) AS reading_date,
  AVG(value) AS avg_value,
  MIN(value) AS min_value,
  MAX(value) AS max_value,
  COUNT(*) AS reading_count
FROM reading
GROUP BY sensor_id, DATE_TRUNC('day', timestamp)
ORDER BY reading_date DESC;

-- Create a unique index to allow concurrent refreshes safely without locking the table entirely
CREATE UNIQUE INDEX idx_daily_averages_unique 
ON daily_sensor_averages (sensor_id, reading_date);

-- Helper function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_daily_sensor_averages()
RETURNS void AS $$
BEGIN
  -- CONCURRENTLY prevents the view from locking out readers while it calculates new averages
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sensor_averages;
END;
$$ LANGUAGE plpgsql;
