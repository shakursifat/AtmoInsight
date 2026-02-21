-- Clean up existing roles
TRUNCATE TABLE userrole CASCADE;

-- Insert the 3 Core Supported Roles
INSERT INTO userrole (role_id, role_name, permissions) VALUES
(1, 'Admin', 'ALL'),
(2, 'Scientist', 'ANALYTICS_ONLY'),
(3, 'Citizen', 'READ_ONLY');
