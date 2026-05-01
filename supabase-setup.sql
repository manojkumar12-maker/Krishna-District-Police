-- ============================================================
-- Run this in Supabase SQL Editor to set up the database
-- ============================================================

-- 1. Personnel table
CREATE TABLE IF NOT EXISTS personnel (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  rank TEXT NOT NULL,
  genl_no TEXT NOT NULL,
  personnel_type TEXT NOT NULL,
  district TEXT NOT NULL,
  previous_station TEXT,
  status TEXT DEFAULT 'Present',
  date_of_birth DATE,
  caste TEXT,
  education TEXT,
  date_of_appointment DATE,
  date_of_promotion DATE,
  present_working TEXT,
  is_on_deputation BOOLEAN DEFAULT false,
  deputation_unit TEXT,
  date_of_deputation DATE,
  punishments TEXT,
  phone_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sanctioned strength (New Krishna district ranks)
CREATE TABLE IF NOT EXISTS sanctioned_strength (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  district TEXT NOT NULL,
  personnel_type TEXT NOT NULL,
  rank TEXT NOT NULL,
  sanctioned_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Deputation unit sanctioned strength (per rank per unit)
CREATE TABLE IF NOT EXISTS deputation_strength (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_name TEXT NOT NULL,
  rank TEXT NOT NULL,
  sanctioned_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security Policies
-- ============================================================

ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanctioned_strength ENABLE ROW LEVEL SECURITY;
ALTER TABLE deputation_strength ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
DROP POLICY IF EXISTS "authenticated_all_personnel" ON personnel;
CREATE POLICY "authenticated_all_personnel" ON personnel
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_sanctioned" ON sanctioned_strength;
CREATE POLICY "authenticated_all_sanctioned" ON sanctioned_strength
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_deputation" ON deputation_strength;
CREATE POLICY "authenticated_all_deputation" ON deputation_strength
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Allow anon to read (for initial load, will restrict after auth)
-- DROP POLICY IF EXISTS "anon_read_personnel" ON personnel;
-- CREATE POLICY "anon_read_personnel" ON personnel FOR SELECT TO anon USING (true);

-- ============================================================
-- Helper: Create default deputation strength entries
-- ============================================================

INSERT INTO deputation_strength (unit_name, rank, sanctioned_count)
SELECT u.unit, r.rank, 0
FROM (
  SELECT unnest(ARRAY[
    'GRP., Vijayawada', 'Intelligence Dept, VJA.', 'I.S.W.', 'I.S.W. (CMSG)',
    'R.I.O., SPL. Intelligence Cell', 'C.I.D. A.P., Mangalagiri',
    'Vigilance and Enforcement', 'A.P., Transco', 'A.P., Genco',
    'A.C.B., Vijayawada', 'Grey Hounds', 'Octopus', 'APPA., Hyderabad',
    'Police Computer Service', 'CBI. Visakhapatnam', 'Drugs Control Administration',
    'Eagle', 'CSPS, Visakhapatnam', 'EOW-II, Mangalagiri'
  ]) AS unit
) u
CROSS JOIN (
  SELECT unnest(ARRAY['PC', 'HC', 'ASI', 'ARPC', 'ARHC']) AS rank
) r
ON CONFLICT DO NOTHING;
