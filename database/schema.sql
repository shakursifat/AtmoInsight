-- Enable Required Extensions (Run These First)
CREATE EXTENSION IF NOT EXISTS postgis;  -- For GEOMETRY types
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- For TSTZRANGE (if needed)

-- SQL DDL for AtmoInsight Hub ERD (With Fixes)

CREATE TABLE UserRole (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL,
    permissions TEXT
);

CREATE TABLE Users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INTEGER REFERENCES UserRole(role_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE SensorType (
    sensor_type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE Location (
    location_id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    coordinates GEOMETRY(POINT, 4326),
    address TEXT,
    region VARCHAR(100)
);

CREATE TABLE Sensor (
    sensor_id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    sensor_type_id INTEGER REFERENCES SensorType(sensor_type_id),
    location_id INTEGER REFERENCES Location(location_id),
    status VARCHAR(50),
    installed_at DATE
    source_id INTEGER REFERENCES DataSource(source_id)
);

CREATE TABLE MeasurementType (
    measurement_type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE MeasurementUnit (
    unit_id SERIAL PRIMARY KEY,
    unit_name VARCHAR(50) NOT NULL,
    symbol VARCHAR(20)
);

CREATE TABLE Reading (
    reading_id SERIAL PRIMARY KEY,
    sensor_id INTEGER REFERENCES Sensor(sensor_id),
    timestamp TIMESTAMPTZ NOT NULL,
    value NUMERIC,
    measurement_type_id INTEGER REFERENCES MeasurementType(measurement_type_id),
    unit_id INTEGER REFERENCES MeasurementUnit(unit_id),
    source_id INTEGER REFERENCES DataSource(source_id)
);

CREATE TABLE AlertType (
    alert_type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(50) NOT NULL,
    description TEXT
);

CREATE TABLE AlertThreshold (
    threshold_id SERIAL PRIMARY KEY,
    measurement_type_id INTEGER REFERENCES MeasurementType(measurement_type_id),
    min_value NUMERIC,
    max_value NUMERIC,
    severity VARCHAR(20)
);

CREATE TABLE Alert (
    alert_id SERIAL PRIMARY KEY,
    reading_id INTEGER REFERENCES Reading(reading_id),
    alert_type_id INTEGER REFERENCES AlertType(alert_type_id),
    message TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    severity VARCHAR(20)
);

CREATE TABLE ReportStatus (
    status_id SERIAL PRIMARY KEY,
    status_name VARCHAR(50) NOT NULL,
    description TEXT
);

CREATE TABLE UserReport (
    report_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES Users(user_id),
    description TEXT NOT NULL,
    location_id INTEGER REFERENCES Location(location_id),
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    status_id INTEGER REFERENCES ReportStatus(status_id)
);

CREATE TABLE HistoricalAggregation (
    agg_id SERIAL PRIMARY KEY,
    period VARCHAR(20),
    avg_value NUMERIC,
    max_value NUMERIC,
    min_value NUMERIC,
    timestamp_range TSTZRANGE,
    measurement_type_id INTEGER REFERENCES MeasurementType(measurement_type_id)
);

CREATE TABLE NotificationLog (
    log_id SERIAL PRIMARY KEY,
    alert_id INTEGER REFERENCES Alert(alert_id),
    user_id INTEGER REFERENCES Users(user_id),
    sent_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    method VARCHAR(50),
    status VARCHAR(50)
);

CREATE TABLE DisasterSubgroup (
    subgroup_id SERIAL PRIMARY KEY,
    subgroup_name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE DisasterType (
    type_id SERIAL PRIMARY KEY,
    type_name VARCHAR(100) NOT NULL,
    subgroup_id INTEGER REFERENCES DisasterSubgroup(subgroup_id),
    description TEXT
);

CREATE TABLE DisasterEvent (
    event_id SERIAL PRIMARY KEY,
    disaster_type_id INTEGER REFERENCES DisasterType(type_id),
    start_timestamp TIMESTAMPTZ,
    end_timestamp TIMESTAMPTZ,
    severity VARCHAR(50),
    description TEXT,
    location_id INTEGER REFERENCES Location(location_id)
);

CREATE TABLE DisasterImpact (
    impact_id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES DisasterEvent(event_id),
    deaths INTEGER,
    injuries INTEGER,
    economic_loss NUMERIC,
    affected_people INTEGER,
    description TEXT
);

CREATE TABLE GeologicalEvent (
    geo_event_id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES DisasterEvent(event_id),
    magnitude NUMERIC,
    depth NUMERIC,
    epicenter GEOMETRY(POINT, 4326),
    description TEXT
);

CREATE TABLE MeteorologicalEvent (
    meteo_event_id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES DisasterEvent(event_id),
    wind_speed NUMERIC,
    pressure NUMERIC,
    precipitation NUMERIC,
    description TEXT
);

CREATE TABLE HydrologicalEvent (
    hydro_event_id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES DisasterEvent(event_id),
    water_level NUMERIC,
    discharge_rate NUMERIC,
    flood_extent NUMERIC,
    affected_area_location GEOMETRY(POLYGON, 4326),
    description TEXT
);

CREATE TABLE ClimateIndicator (
    indicator_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    value NUMERIC,
    period VARCHAR(50),
    agg_id INTEGER REFERENCES HistoricalAggregation(agg_id)
);

CREATE TABLE WeatherModel (
    model_id SERIAL PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    source VARCHAR(100),
    description TEXT
);

CREATE TABLE Forecast (
    forecast_id SERIAL PRIMARY KEY,
    weather_model_id INTEGER REFERENCES WeatherModel(model_id),
    predicted_timestamp TIMESTAMPTZ,
    probability NUMERIC,
    description TEXT,
    location_id INTEGER REFERENCES Location(location_id)
);

CREATE TABLE SatelliteObservation (
    obs_id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ,
    resolution VARCHAR(50),
    orbit_type VARCHAR(50),
    data_json JSONB,
    reading_id INTEGER REFERENCES Reading(reading_id)
);

CREATE TABLE DataSource (
    source_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    source_type VARCHAR(50),
    description TEXT,
    url TEXT
);

-- Indexes for Performance Optimization
CREATE INDEX idx_reading_sensor_timestamp ON Reading(sensor_id, timestamp);

CREATE INDEX idx_alert_reading_timestamp ON Alert(reading_id, timestamp);

CREATE INDEX idx_disaster_event_location ON DisasterEvent(location_id);

-- Sample Data Insertion (Optional)
-- INSERT INTO UserRole (role_name, permissions) VALUES ('Admin', 'ALL'), ('User', 'READ_ONLY');
-- INSERT INTO Users (username, email, password_hash, role_id) VALUES ('admin', 'admin@example.com', 'hashed_password', 1);
-- INSERT INTO SensorType (type_name, description) VALUES ('Temperature', 'Measures ambient temperature'), ('Humidity', 'Measures relative humidity');
-- INSERT INTO Location (name, coordinates, address, region) VALUES ('Station A', ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326), '123 Main St, San Francisco, CA', 'West Coast');
-- INSERT INTO Sensor (name, sensor_type_id, location_id, status, installed_at) VALUES ('Temp Sensor 1', 1, 1, 'Active', '2023-01-15');
-- INSERT INTO MeasurementType (type_name, description) VALUES ('Temperature', 'Ambient temperature in Celsius'), ('Humidity', 'Relative humidity percentage');
-- INSERT INTO MeasurementUnit (unit_name, symbol) VALUES ('Celsius', '°C'), ('Percentage', '%');
-- INSERT INTO Reading (sensor_id, timestamp, value, measurement_type_id, unit_id) VALUES (1, '2023-10-01 12:00:00+00', 22.5, 1, 1);
-- INSERT INTO AlertType (type_name, description) VALUES ('High Temperature', 'Alert for high temperature readings');
-- INSERT INTO AlertThreshold (measurement_type_id, min_value, max_value, severity) VALUES (1, NULL, 30.0, 'High');
-- INSERT INTO Alert (reading_id, alert_type_id, message, severity) VALUES (1, 1, 'Temperature exceeded threshold', 'High');
-- INSERT INTO ReportStatus (status_name, description) VALUES ('Open', 'Report is open'), ('In Progress', 'Report is being addressed'), ('Closed', 'Report has been resolved');
-- INSERT INTO UserReport (user_id, description, location_id, status_id) VALUES (1, 'Observed unusual weather patterns', 1, 1);
-- INSERT INTO HistoricalAggregation (period, avg_value, max_value, min_value, timestamp_range, measurement_type_id) VALUES ('Daily', 20.0, 30.0, 10.0, '[2023-10-01 00:00:00+00,2023-10-02 00:00:00+00)', 1);
-- INSERT INTO NotificationLog (alert_id, user_id, method, status) VALUES (1, 1, 'Email', 'Sent'); 
-- INSERT INTO DisasterSubgroup (subgroup_name, description) VALUES ('Meteorological', 'Weather-related disasters'), ('Geological', 'Earth-related disasters');
-- INSERT INTO DisasterType (type_name, subgroup_id, description) VALUES ('Hurricane', 1, 'A severe tropical cyclone'), ('Earthquake', 2, 'Sudden shaking of the ground');
-- INSERT INTO DisasterEvent (disaster_type_id, start_timestamp, end_timestamp, severity, description, location_id) VALUES (1, '2023-09-15 00:00:00+00', '2023-09-20 00:00:00+00', 'Severe', 'Category 4 hurricane', 1);
-- INSERT INTO DisasterImpact (event_id, deaths, injuries, economic_loss, affected_people, description) VALUES (1, 10, 50, 1000000.00, 5000, 'Significant damage to infrastructure');
-- INSERT INTO GeologicalEvent (event_id, magnitude, depth, epicenter, description) VALUES (1, 6.5, 10.0, ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326), 'Moderate earthquake');
-- INSERT INTO MeteorologicalEvent (event_id, wind_speed, pressure, precipitation, description) VALUES (1, 150.0, 950.0, 200.0, 'High wind speeds and heavy rainfall');
-- INSERT INTO HydrologicalEvent (event_id, water_level, discharge_rate, flood_extent, affected_area_location, description) VALUES (1, 8.5, 1250.0, 5000.0, ST_SetSRID(ST_MakePolygon(ST_GeomFromText('LINESTRING(-122.45 37.77, -122.40 37.77, -122.40 37.72, -122.45 37.72, -122.45 37.77)')), 4326), 'Severe flooding in coastal areas');
-- INSERT INTO ClimateIndicator (name, value, period, agg_id) VALUES ('Global Temperature Anomaly', 1.2, 'Annual', 1);
-- INSERT INTO WeatherModel (model_name, source, description) VALUES ('GFS', 'NOAA', 'Global Forecast System model');
-- INSERT INTO Forecast (weather_model_id, predicted_timestamp, probability, description, location_id)  VALUES (1, '2023-10-05 12:00:00+00', 0.8, 'High chance of rain', 1);
-- INSERT INTO SatelliteObservation (timestamp, resolution, orbit_type, data_json, reading_id) VALUES ('2023-10-01 12:00:00+00', 'High', 'Polar', '{"cloud_coverage": 75}', 1);
-- INSERT INTO DataSource (name, source_type, description, url) VALUES ('NOAA', 'Government', 'National Oceanic and Atmospheric Administration', 'https://www.noaa.gov');
-- End of AtmoInsight Hub ERD SQL DDL