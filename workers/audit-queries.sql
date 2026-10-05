-- Phase 6.6 Production Audit Queries
-- Execute against production D1 database

-- Duplicate genl_no audit
SELECT genl_no, COUNT(*) AS count
FROM personnel
WHERE deleted_at IS NULL
GROUP BY genl_no
HAVING COUNT(*) > 1;

-- Blank/null genl_no audit
SELECT COUNT(*) AS blank_count
FROM personnel
WHERE deleted_at IS NULL
AND (genl_no IS NULL OR genl_no = '');

-- Enum compatibility: rank
SELECT DISTINCT rank FROM personnel WHERE deleted_at IS NULL;

-- Enum compatibility: district
SELECT DISTINCT district FROM personnel WHERE deleted_at IS NULL;

-- Enum compatibility: personnel_type
SELECT DISTINCT personnel_type FROM personnel WHERE deleted_at IS NULL;

-- Enum compatibility: status
SELECT DISTINCT status FROM personnel WHERE deleted_at IS NULL;
