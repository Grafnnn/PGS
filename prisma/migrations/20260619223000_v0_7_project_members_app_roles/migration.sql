ALTER TABLE "project_members"
  ALTER COLUMN "role" TYPE TEXT USING
    CASE
      WHEN "role"::text IN ('owner', 'super_admin') THEN 'OWNER'
      WHEN "role"::text IN ('project_manager', 'technical_director', 'pto', 'procurement', 'site_engineer', 'finance') THEN 'MANAGER'
      WHEN "role"::text IN ('subcontractor') THEN 'VIEWER'
      WHEN "role"::text IN ('OWNER', 'ADMIN', 'MANAGER', 'VIEWER') THEN "role"::text
      ELSE 'VIEWER'
    END;
