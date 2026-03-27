'use strict';

/**
 * Route: GET /api/current-conditions
 *
 * Query parameters (at least one group is required):
 *   ?location_id=<number>           — resolves lat/lon from the Location table
 *   ?lat=<number>&lon=<number>      — explicit coordinates
 *
 * Examples:
 *   GET /api/current-conditions?location_id=1
 *   GET /api/current-conditions?lat=23.7104&lon=90.4074
 *
 * Returns a structured JSON object with:
 *   location, aqi, pollutants, weather, fetchedAt
 */

const express = require('express');
const { getCurrentConditions } = require('../services/iqairService');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { location_id, lat, lon } = req.query;

    // Validate: need at least one valid input
    if (!location_id && (!lat || !lon)) {
      return res.status(400).json({
        success: false,
        error: 'Provide either ?location_id=<number> or both ?lat=<number>&lon=<number>.',
      });
    }

    const options = {};

    if (location_id) {
      const parsedId = parseInt(location_id, 10);
      if (isNaN(parsedId) || parsedId <= 0) {
        return res.status(400).json({ success: false, error: 'location_id must be a positive integer.' });
      }
      options.location_id = parsedId;
    } else {
      const parsedLat = parseFloat(lat);
      const parsedLon = parseFloat(lon);
      if (isNaN(parsedLat) || isNaN(parsedLon)) {
        return res.status(400).json({ success: false, error: 'lat and lon must be valid numbers.' });
      }
      options.lat = parsedLat;
      options.lon = parsedLon;
    }

    const conditions = await getCurrentConditions(options);
    return res.json({ success: true, data: conditions });

  } catch (err) {
    console.error('[GET /api/current-conditions] Error:', err.message);

    // Surface IQAir-specific errors cleanly
    if (err.message.includes('IQAIR_API_KEY')) {
      return res.status(500).json({ success: false, error: 'IQAir API key not configured. Set IQAIR_API_KEY in .env.' });
    }
    if (err.message.includes('not found in database')) {
      return res.status(404).json({ success: false, error: err.message });
    }

    return res.status(500).json({ success: false, error: 'Failed to fetch current conditions.' });
  }
});

module.exports = router;
