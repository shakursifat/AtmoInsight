#!/usr/bin/env node
'use strict';

/**
 * One-off cleanup: duplicate alerts (same sensor + alert type in short windows)
 * and duplicate meteorological DisasterEvent / MeteorologicalEvent rows at the same location.
 *
 * Usage: node scripts/cleanup-duplicate-alerts.js
 * Requires DATABASE_URL (same as the main app).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const ALERT_BUCKET_SECONDS = Number(process.env.CLEANUP_ALERT_BUCKET_SECONDS || 300); // 5 min
const MET_WINDOW_HOURS = Number(process.env.CLEANUP_MET_WINDOW_HOURS || 12);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

async function cleanupDuplicateAlerts(client) {
  const bucket = Math.max(60, ALERT_BUCKET_SECONDS);
  const del = await client.query(
    `
    WITH ranked AS (
      SELECT alert_id,
             ROW_NUMBER() OVER (
               PARTITION BY sensor_id, alert_type_id,
                 (EXTRACT(epoch FROM timestamp) / $1)::bigint
               ORDER BY timestamp DESC, alert_id DESC
             ) AS rn
      FROM alert
      WHERE sensor_id IS NOT NULL
    )
    DELETE FROM alert a
    USING ranked r
    WHERE a.alert_id = r.alert_id
      AND r.rn > 1
    RETURNING a.alert_id
    `,
    [bucket]
  );
  return del.rowCount;
}

async function mergeMeteorologicalClusters(client) {
  const { rows: clusters } = await client.query(
    `
    SELECT ARRAY_AGG(d.event_id ORDER BY d.start_timestamp) AS all_ids,
           MIN(d.start_timestamp) AS start_ts,
           MAX(COALESCE(d.end_timestamp, d.start_timestamp)) AS end_ts
    FROM disasterevent d
    JOIN disastertype dt ON dt.type_id = d.disaster_type_id
    JOIN disastersubgroup ds ON ds.subgroup_id = dt.subgroup_id
    WHERE ds.subgroup_name = 'Meteorological'
    GROUP BY d.location_id, d.disaster_type_id,
             (EXTRACT(epoch FROM d.start_timestamp) / ($1 * 3600))::bigint
    HAVING COUNT(*) > 1
    `,
    [MET_WINDOW_HOURS]
  );

  let merged = 0;
  for (const c of clusters) {
    const survivor = c.all_ids[0];
    const others = c.all_ids.slice(1);
    if (others.length === 0) continue;

    const maxMet = await client.query(
      `
      SELECT
        MAX(m.wind_speed) AS wind_speed,
        MIN(m.pressure) FILTER (WHERE m.pressure IS NOT NULL) AS pressure,
        MAX(m.precipitation) AS precipitation
      FROM meteorologicalevent m
      WHERE m.event_id = ANY($1::int[])
      `,
      [c.all_ids]
    );

    const { wind_speed, pressure, precipitation } = maxMet.rows[0];

    await client.query(
      `
      UPDATE disasterevent
      SET start_timestamp = $2,
          end_timestamp = $3,
          description = COALESCE(description, '') || ' [merged cleanup]'
      WHERE event_id = $1
      `,
      [survivor, c.start_ts, c.end_ts]
    );

    const metExists = await client.query(
      'SELECT meteo_event_id FROM meteorologicalevent WHERE event_id = $1',
      [survivor]
    );

    if (metExists.rows.length > 0) {
      await client.query(
        `
        UPDATE meteorologicalevent
        SET wind_speed = CASE
              WHEN $2 IS NOT NULL THEN GREATEST(COALESCE(wind_speed, $2), $2)
              ELSE wind_speed
            END,
            pressure = CASE
              WHEN $3 IS NOT NULL THEN LEAST(COALESCE(pressure, $3), $3)
              ELSE pressure
            END,
            precipitation = CASE
              WHEN $4 IS NOT NULL THEN GREATEST(COALESCE(precipitation, $4), $4)
              ELSE precipitation
            END
        WHERE event_id = $1
        `,
        [survivor, wind_speed, pressure, precipitation]
      );
    } else if (wind_speed != null || pressure != null || precipitation != null) {
      await client.query(
        `
        INSERT INTO meteorologicalevent (event_id, wind_speed, pressure, precipitation, description)
        VALUES ($1, $2, $3, $4, 'Merged from cleanup script.')
        `,
        [survivor, wind_speed, pressure, precipitation]
      );
    }

    await client.query('DELETE FROM meteorologicalevent WHERE event_id = ANY($1::int[])', [others]);
    await client.query('DELETE FROM disasterimpact WHERE event_id = ANY($1::int[])', [others]);
    await client.query('DELETE FROM disasterevent WHERE event_id = ANY($1::int[])', [others]);
    merged += others.length;
  }

  return merged;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const alertDeleted = await cleanupDuplicateAlerts(client);
    console.log(`Deleted ${alertDeleted} duplicate alert row(s) (bucket=${ALERT_BUCKET_SECONDS}s).`);

    const metMerged = await mergeMeteorologicalClusters(client);
    console.log(`Removed ${metMerged} redundant meteorological disaster event row(s) (window=${MET_WINDOW_HOURS}h).`);

    await client.query('COMMIT');
    console.log('Cleanup finished successfully.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Cleanup failed:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
