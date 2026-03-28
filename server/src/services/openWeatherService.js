'use strict';

/**
 * Thin re-export so the service lives at server/src/services/openWeatherService.js
 * while sharing one implementation with the running app (root src/).
 */
module.exports = require('../../../src/services/openWeatherService');
