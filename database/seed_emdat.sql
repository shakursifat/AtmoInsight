-- Clean up existing (for idempotency in dev)
TRUNCATE TABLE disastersubgroup CASCADE;

-- Insert EM-DAT Subgroups
INSERT INTO disastersubgroup (subgroup_id, subgroup_name, description) VALUES
(1, 'Meteorological', 'Events caused by short-lived, micro- to meso-scale extreme weather and atmospheric conditions.'),
(2, 'Climatological', 'Events caused by long-lived, meso- to macro-scale atmospheric processes.'),
(3, 'Geophysical', 'Events originating from solid earth.'),
(4, 'Hydrological', 'Events caused by deviations in the normal water cycle and/or overflow of bodies of water.')
ON CONFLICT (subgroup_id) DO NOTHING;

-- Insert common EM-DAT Disaster Types mapped to the subgroups
INSERT INTO disastertype (type_id, type_name, subgroup_id, description) VALUES
(1, 'Extreme Temperature', 1, 'Heat wave, cold wave, extreme winter conditions.'),
(2, 'Storm', 1, 'Tropical cyclone, extra-tropical cyclone, local storm.'),
(3, 'Drought', 2, 'Extended period of unusually low precipitation.'),
(4, 'Wildfire', 2, 'Forest fire, land fire.'),
(5, 'Earthquake', 3, 'Ground shaking and accompanying geophysical processes.'),
(6, 'Volcanic activity', 3, 'Ash fall, lahar, pyroclastic flow, lava flow.'),
(7, 'Flood', 4, 'Riverine flood, flash flood, coastal flood.')
ON CONFLICT (type_id) DO NOTHING;
