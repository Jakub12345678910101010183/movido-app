-- ============================================
-- Migration 008: RBAC Permission System
-- For fine-grained role-based access control
-- ============================================

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE, -- e.g., "jobs.view", "jobs.create", "jobs.edit", "jobs.delete"
  description TEXT,
  category VARCHAR(32) NOT NULL CHECK (category IN ('jobs', 'drivers', 'vehicles', 'reports', 'admin', 'pod', 'messages')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role-permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role user_role NOT NULL,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role, permission_id)
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role user_role,
  action TEXT NOT NULL, -- 'ASSIGN_ROLE', 'UPDATE_PERMISSION', 'DELETE_USER', etc.
  resource_type VARCHAR(64), -- 'users', 'roles', 'jobs', etc.
  resource_id INTEGER,
  old_value TEXT,
  new_value TEXT,
  changes JSONB, -- { field: { from: old, to: new }, ... }
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE audit_log;

-- RLS for permissions
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View permissions"
  ON permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
    )
  );

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View role permissions"
  ON role_permissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'dispatcher')
    )
  );

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view audit log"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
    )
  );

-- Helper function to check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(
  p_permission_code TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_role user_role;
BEGIN
  -- Get user's role
  SELECT role INTO v_user_role FROM users WHERE id = auth.uid();

  -- Admin has all permissions
  IF v_user_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Check if permission exists for this role
  RETURN EXISTS (
    SELECT 1
    FROM role_permissions rp
    JOIN permissions p ON rp.permission_id = p.id
    WHERE rp.role = v_user_role
    AND p.code = p_permission_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to log audit event
CREATE OR REPLACE FUNCTION log_audit(
  p_action TEXT,
  p_resource_type VARCHAR(64),
  p_resource_id INTEGER DEFAULT NULL,
  p_old_value TEXT DEFAULT NULL,
  p_new_value TEXT DEFAULT NULL,
  p_changes JSONB DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO audit_log (user_id, actor_role, action, resource_type, resource_id, old_value, new_value, changes)
  SELECT
    auth.uid(),
    (SELECT role FROM users WHERE id = auth.uid()),
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_value,
    p_new_value,
    p_changes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Standard permissions to be seeded (run after migration)
INSERT INTO permissions (code, description, category) VALUES
  -- Jobs
  ('jobs.view', 'View all jobs', 'jobs'),
  ('jobs.view_own', 'View own assigned jobs', 'jobs'),
  ('jobs.create', 'Create new jobs', 'jobs'),
  ('jobs.edit', 'Edit job details', 'jobs'),
  ('jobs.delete', 'Delete jobs', 'jobs'),
  ('jobs.assign', 'Assign jobs to drivers', 'jobs'),

  -- Drivers
  ('drivers.view', 'View driver list and details', 'drivers'),
  ('drivers.create', 'Create new drivers', 'drivers'),
  ('drivers.edit', 'Edit driver details', 'drivers'),
  ('drivers.delete', 'Delete drivers', 'drivers'),

  -- Vehicles
  ('vehicles.view', 'View vehicle list', 'vehicles'),
  ('vehicles.create', 'Create new vehicles', 'vehicles'),
  ('vehicles.edit', 'Edit vehicle details', 'vehicles'),
  ('vehicles.delete', 'Delete vehicles', 'vehicles'),

  -- POD
  ('pod.view', 'View proof of delivery', 'pod'),
  ('pod.capture', 'Capture POD photos/signatures', 'pod'),
  ('pod.verify', 'Verify and approve POD', 'pod'),

  -- Messages
  ('messages.send', 'Send messages to drivers', 'messages'),
  ('messages.view', 'View message history', 'messages'),

  -- Reports
  ('reports.view', 'View reports and analytics', 'reports'),
  ('reports.export', 'Export reports', 'reports'),

  -- Admin
  ('admin.manage_users', 'Create/edit/delete users', 'admin'),
  ('admin.manage_roles', 'Assign roles to users', 'admin'),
  ('admin.view_audit', 'View audit log', 'admin'),
  ('admin.settings', 'Manage system settings', 'admin')
ON CONFLICT (code) DO NOTHING;

-- Seed default role permissions
-- DRIVER role
INSERT INTO role_permissions (role, permission_id)
SELECT 'driver', id FROM permissions WHERE code IN (
  'jobs.view_own',
  'pod.capture',
  'messages.send'
) ON CONFLICT (role, permission_id) DO NOTHING;

-- DISPATCHER role
INSERT INTO role_permissions (role, permission_id)
SELECT 'dispatcher', id FROM permissions WHERE code IN (
  'jobs.view',
  'jobs.create',
  'jobs.edit',
  'jobs.assign',
  'drivers.view',
  'vehicles.view',
  'pod.view',
  'pod.verify',
  'messages.send',
  'messages.view',
  'reports.view'
) ON CONFLICT (role, permission_id) DO NOTHING;

-- ADMIN role
INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', id FROM permissions
ON CONFLICT (role, permission_id) DO NOTHING;

-- Trigger to log user role changes
CREATE OR REPLACE FUNCTION log_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM log_audit(
      'ASSIGN_ROLE',
      'users',
      (SELECT id FROM users WHERE id = NEW.id LIMIT 1)::INTEGER,
      OLD.role::TEXT,
      NEW.role::TEXT,
      jsonb_build_object('role', jsonb_build_object('from', OLD.role::TEXT, 'to', NEW.role::TEXT))
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to users table (if not already done)
DROP TRIGGER IF EXISTS log_role_change_trigger ON users;
CREATE TRIGGER log_role_change_trigger
  AFTER UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION log_role_change();
