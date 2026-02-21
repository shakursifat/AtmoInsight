-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION check_reading_threshold()
RETURNS TRIGGER AS $$
DECLARE
  v_alert_msg TEXT;
  v_severity VARCHAR(50);
  v_location_id INTEGER;
  v_event_id INTEGER;
BEGIN
  -- We assume standard threshold for simulation: value > 80
  IF NEW.value > 80 THEN
    v_alert_msg := 'High sensor value detected! Threshold exceeded via DB Trigger.';
    
    IF NEW.value > 95 THEN
      v_severity := 'CRITICAL';
    ELSE
      v_severity := 'HIGH';
    END IF;

    -- Insert into the alert table
    -- Required Schema: reading_id, alert_type_id, timestamp, message, severity
    INSERT INTO alert (reading_id, alert_type_id, timestamp, message, severity)
    VALUES (NEW.reading_id, 1, NOW(), v_alert_msg, v_severity);

    -- Notify the Node.js backend using pg_notify for the alert
    PERFORM pg_notify('new_alert_channel', NEW.reading_id::text);
    
    -- DISASTER EVENT INTEGRATION:
    -- If value > 95, it's categorized as a full Disaster. Let's auto-generate an event.
    IF NEW.value > 95 THEN
      -- Get location_id for the sensor
      SELECT location_id INTO v_location_id FROM sensor WHERE sensor_id = NEW.sensor_id;
      
      -- Insert into disasterevent (Assume disaster_type_id = 1 for Extreme Temp based on seed)
      -- Required Schema: disaster_type_id, start_timestamp, severity, description, location_id
      INSERT INTO disasterevent (disaster_type_id, start_timestamp, severity, description, location_id)
      VALUES (1, NOW(), 'EXTREME', 'Automatic Disaster Event triggered by critical sensor threshold (' || NEW.value || ')', v_location_id)
      RETURNING event_id INTO v_event_id;
      
      -- Notify Node.js for the disaster occurrence via pub-sub
      -- We pass the new event_id so the frontend can retrieve the location mapping
      PERFORM pg_notify('new_disaster_channel', v_event_id::text);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop the trigger if it already exists to avoid duplication
DROP TRIGGER IF EXISTS reading_threshold_trigger ON reading;

-- 3. Create the trigger on the reading table
CREATE TRIGGER reading_threshold_trigger
AFTER INSERT ON reading
FOR EACH ROW
EXECUTE FUNCTION check_reading_threshold();
