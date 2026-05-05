-- ─── Step 1: Make pm_roster.email nullable ────────────────────────────────────
-- The roster is now a name-only whitelist. PMs choose their own email at
-- registration — no email pre-seeding required.
ALTER TABLE pm_roster ALTER COLUMN email DROP NOT NULL;
ALTER TABLE pm_roster DROP CONSTRAINT IF EXISTS pm_roster_email_key;

-- ─── Step 2: Add new PMs to roster ───────────────────────────────────────────
INSERT INTO pm_roster (full_name) VALUES
  ('Nick Budgen'),
  ('Faye Morgan'),
  ('Alison Archer'),
  ('Richard Smith')
ON CONFLICT (full_name) DO NOTHING;

-- ─── Step 2: Insert all properties ───────────────────────────────────────────

INSERT INTO properties (ref, name, management_company, block_type, address, number_of_units, manager_name)
VALUES

-- ── Richard Smith ─────────────────────────────────────────────────────────────
('TEST',  'TEST Block',
  'Test Block Management Ltd',
  'Residential', '1 Test Street, Cheltenham, GL51 7ND', 7, 'Richard Smith'),

('T38',   'Tolsey Quay',
  'Tolsey Quay Management Limited',
  'Residential', 'Back of Avon, Tewkesbury, GL20 5UR', 54, 'Richard Smith'),

-- ── Nick Budgen ───────────────────────────────────────────────────────────────
('W61',  'Wyddrington House',
  'Wyddrington House Management Company Limited',
  'Residential', '55 Pittville Lawn, Cheltenham, GL52 5BQ', 8, 'Nick Budgen'),

('T20',  'Tudor Court',
  'Tudor Court Freehold Gloucester Limited',
  'Residential', '4-6 Alexandra Road, Gloucester, GL1 3DR', 27, 'Nick Budgen'),

('S136', 'Springwood House',
  'Springwood House RTM Company Ltd',
  'Residential', '36 Parton Road, Churchdown, Gloucester, GL3 2AD', 6, 'Nick Budgen'),

('S126', '127 St George''s Road',
  'Fromefield Management Company Limited',
  'Residential', '127 St Georges Road, Cheltenham, GL50 3EQ', 3, 'Nick Budgen'),

('S124', 'Stone Manor',
  'The Stone Manor Management Company Limited',
  'Residential', 'Stone Manor, Bisley Road, Stroud, GL5 1JD', 59, 'Nick Budgen'),

('R51',  'Reddings Park',
  'Reddings Park Community Ltd',
  'Residential', 'Reddings Park, Cheltenham, GL51 6UD', 22, 'Nick Budgen'),

('R49',  'Raglan Court',
  'Raglan Court Management Company Limited',
  'Residential', 'Regent Street, Gloucester, GL1 4UB', 15, 'Nick Budgen'),

('Q2',   'Queens Court',
  'Queen''s Road Court (Cheltenham) Limited',
  'Residential', 'Queens Road, Cheltenham, GL50 2LU', 48, 'Nick Budgen'),

('P59',  'Pittville Place',
  'Pittville Place (Cheltenham) RTM Company Limited',
  'Residential', 'Pittville Place, Albert Road, Cheltenham, GL52 3HZ', 16, 'Nick Budgen'),

('N12',  '45-47 Northgate Street',
  'MR & JM Investments Ltd',
  'Residential', '45-47 Northgate Street, Gloucester, GL1 2AJ', 12, 'Nick Budgen'),

('N11',  'New Penny Court',
  'RS Developments Limited',
  'Residential', 'Millbrook Street, Cheltenham, GL50 3RB', 12, 'Nick Budgen'),

('L68',  '97 & 97A London Road',
  'Pivotal Build LLP',
  'Residential', '97 & 97A London Road, Gloucester, GL1 3HH', 12, 'Nick Budgen'),

('L66',  'Lime Tree Court',
  'Lime Tree Court (Hunts Grove) Management Company Limited',
  'Residential', 'Lime Tree Court, Lime Tree Avenue, Hardwicke, Gloucester, GL2 4AW', 12, 'Nick Budgen'),

('H82',  '64 Hales Road',
  '64 Hales Road Ltd',
  'Residential', '64 Hales Road, Cheltenham, GL52 6SS', 12, 'Nick Budgen'),

('H53',  'High Point',
  'High Point (Cheltenham) Management Company Limited',
  'Residential', 'High Point, Overton Park, Cheltenham, GL50 3BW', 8, 'Nick Budgen'),

('H48',  'Chapman Way',
  'Chapman Way Management Company Limited',
  'Residential', 'Chapman Way, Cheltenham, GL51 3NE', 12, 'Nick Budgen'),

('E28',  'Ellerslie',
  '108 Albert Road Limited',
  'Residential', '108 Albert Road, Cheltenham, GL52 3JB', 13, 'Nick Budgen'),

('C104', 'Crofton Lodge',
  'Crofton Lodge Trust',
  'Residential', '3 Grafton Road, Cheltenham, GL50 2ET', 6, 'Nick Budgen'),

('B118', 'Bowbridge Wharf',
  'Bowbridge Wharf Management Company Limited',
  'Residential', 'Bowbridge Wharf, Stroud, GL5 2LD', 36, 'Nick Budgen'),

('B113', 'Bradley Drive',
  'Bradley Drive Management Company Limited',
  'Residential', 'Bradley Drive, Northleach, GL54 3DA', 5, 'Nick Budgen'),

('B107', 'Berkeley House',
  'Berkeley House (Gloucester) Ltd',
  'Residential', 'Falcon Close, Quedgeley, Gloucester, GL2 4LY', 13, 'Nick Budgen'),

('B106', 'Bisley House',
  'Berkeley House (Gloucester) Ltd',
  'Residential', 'Falcon Close, Quedgeley, Gloucester, GL2 4LY', 15, 'Nick Budgen'),

('I7',   'Indigo Place',
  'Indigo Place Management Company Limited',
  'Commercial & Residential', 'Dunalley Street, Cheltenham, GL50 4FF', 15, 'Nick Budgen'),

('B116', '252 Bath Road',
  '252 Bath Road Management Company Limited',
  'Commercial & Residential', '252 Bath Road, Cheltenham, GL53 7NB', 9, 'Nick Budgen'),

-- ── Faye Morgan ───────────────────────────────────────────────────────────────
('W62',  'West Grange Court',
  'West Grange Court Management Limited',
  'Residential', 'West Grange Court, Lovedays Mead, Stroud, GL5 1XB', 26, 'Faye Morgan'),

('S135', 'Sandfield Court',
  'Sandfield Court Management Company Ltd',
  'Residential', 'Sandfield Court, Station Road, Churchdown, Gloucester, GL3 2JT', 10, 'Faye Morgan'),

('S128', 'Saunders Court',
  'Brightsplit 5 Limited',
  'Residential', '128b Barnwood Road, Gloucester, GL4 3DT', 14, 'Faye Morgan'),

('P63',  'Painswick Lodge',
  'Painswick Lodge Management Company Limited',
  'Residential', '67 Shurdington Road, Cheltenham, GL53 0JG', 3, 'Faye Morgan'),

('P62',  '35 Park Road',
  '35 Park Road (Management) Limited',
  'Residential', '35 Park Road, Gloucester, GL1 1LN', 7, 'Faye Morgan'),

('P61',  'Phoenix Park',
  'Phoenix Park Management Company Limited',
  'Residential', 'Stanley View, Stroud, GL5 3NJ', 10, 'Faye Morgan'),

('O11',  'Oriel House',
  'Oriel House Freehold Management Limited',
  'Residential', 'Oriel House, Oriel Road, Cheltenham, GL50 1XP', 15, 'Faye Morgan'),

('M63',  '41 Montpellier Terrace',
  '41 Montpelier Terrace Residents Association Limited',
  'Residential', '41 Montpellier Terrace, Cheltenham, GL50 1UX', 5, 'Faye Morgan'),

('L31',  'Lansdown Castle Drive',
  'Harper Group Construction Limited',
  'Residential', 'Lansdown Castle Drive, Cheltenham, GL51 7AF', 12, 'Faye Morgan'),

('F30',  'Fieldcourt Farmhouse',
  'Fieldcourt Farmhouse Community Ltd',
  'Residential', 'Courtfield Road, Quedgeley, Gloucester, GL2 4WQ', 27, 'Faye Morgan'),

('E31',  'Emerypark',
  'Emerypark Management Limited',
  'Residential', 'Gardner Court, Emery Avenue, Gloucester, GL1 5EY', 30, 'Faye Morgan'),

('C99',  'Cranley',
  'Cranley Management Company (1991) Limited',
  'Residential', 'Cranley, Wellington Square, Cheltenham, GL50 4JX', 15, 'Faye Morgan'),

('C94',  'Charlotte Rose House',
  'Charlotte Rose House Freehold Limited',
  'Residential', '4 Christchurch Road, Cheltenham, GL50 2PB', 14, 'Faye Morgan'),

('C93',  'Codenham Lodge',
  'Codenham Lodge (Cheltenham) Limited',
  'Residential', '27 St Stephens Road, Cheltenham, GL51 3AB', 7, 'Faye Morgan'),

('C81',  'Coppice Gate',
  'Coppice Gate (Management) Limited',
  'Residential', 'Coppice Gate, Hayden Lane, Cheltenham, GL51 9QL', 36, 'Faye Morgan'),

('C56',  'Claremont',
  'R F and K L Cook',
  'Residential', 'Whaddon Road, Cheltenham, GL52 5LZ', 13, 'Faye Morgan'),

('C108', 'Cathedral House',
  'Cathedral House RTM Company Limited',
  'Residential', 'Three Cocks Lane, Gloucester, GL1 2QU', 15, 'Faye Morgan'),

('C101', 'Cornmill Court',
  'Brightsplit 5 Limited',
  'Residential', 'Colin Road, Gloucester, GL4 3JQ', 12, 'Faye Morgan'),

('B71',  'Brook Court',
  'Brook Court Management (Cheltenham) Limited',
  'Residential', '53 The Park, Cheltenham, GL50 2SB', 6, 'Faye Morgan'),

('B120', 'Brunswick Square',
  'Clark Holdings (UK) Limited',
  'Residential', 'Brunswick Square, Gloucester, GL1 1UN', 19, 'Faye Morgan'),

('L69',  '221 London Road',
  'Brightsplit 5 Limited',
  'Commercial & Residential', '221 London Road, Charlton Kings, Cheltenham, GL52 6HZ', 4, 'Faye Morgan'),

('E29',  'Elgin Court',
  'Elgin Mall Management Company Limited',
  'Commercial & Residential', 'Elgin Court, High Street, Stonehouse, GL10 2BP', 14, 'Faye Morgan'),

-- ── Alison Archer ─────────────────────────────────────────────────────────────
('W59',   'Wellesley Court',
  'Wellesley Court Residents Association Limited',
  'Residential', 'St Martins Terrace, Clarence Square, Cheltenham, GL50 4JR', 18, 'Alison Archer'),

('S137',  'SPRA',
  'Sandford Park Residents Association Limited',
  'Residential', 'Keynshambury Road, Cheltenham, GL52 6HB', 24, 'Alison Archer'),

('S127',  'Sellars Bridge',
  'Sellars Bridge Management Company (Hardwicke) Limited',
  'Residential', 'Bridge Keeper''s Way, Hardwicke, Gloucester, GL2 4BD', 176, 'Alison Archer'),

('S125R', 'Sherborne Sinking Fund',
  'Sherborne Park Residents Co. Limited',
  'Residential', 'Sherborne House, Sherborne, Cheltenham, GL54 3DZ', 30, 'Alison Archer'),

('S125',  'Sherborne House',
  'Sherborne Park Residents Co. Limited',
  'Residential', 'Sherborne House, Sherborne, Cheltenham, GL54 3DZ', 30, 'Alison Archer'),

('P55',   'Scoriton',
  'Scoriton Limited',
  'Residential', 'Scoriton, 16 Pittville Crescent, Cheltenham, GL52 2QZ', 8, 'Alison Archer'),

('P45',   'Pittville Court',
  'Pittville Court (Cheltenham) Limited',
  'Residential', 'Pittville Court, Albert Road, Cheltenham, GL52 3JA', 44, 'Alison Archer'),

('P39',   'The Pavilions',
  'The Pavilions (Cheltenham) Management Company Limited',
  'Residential', 'Sandford Road, Cheltenham, GL53 7AR', 23, 'Alison Archer'),

('M56',   'Millbrook Court',
  'Miss L Pennell',
  'Residential', 'Millbrook Court, Millbrook Street, Cheltenham, GL50 3RR', 9, 'Alison Archer'),

('L72',   'Lake Lane',
  'Lake Lane Management Company Limited',
  'Residential', 'Cadbury Close, Frampton on Severn, Gloucester, GL2 7AZ', 19, 'Alison Archer'),

('L65',   '7 Lypiatt Terrace',
  '7 Lypiatt Terrace (Cheltenham) Limited',
  'Residential', '7 Lypiatt Terrace, Lypiatt Road, Cheltenham, GL50 2SX', 4, 'Alison Archer'),

('L35A',  '4 Lansdown Terrace',
  'Sarah Baylis',
  'Residential', '4 Lansdown Terrace, Malvern Road, Cheltenham, GL50 2JT', 7, 'Alison Archer'),

('J50',   'King Johns Court',
  'Johns Court (Tewkesbury) Management Company Limited',
  'Residential', 'King Johns Court, Tewkesbury, GL20 6EG', 28, 'Alison Archer'),

('I6',    'Imperial Apartments',
  'Imperial Apartments Cheltenham (Management) Company Limited',
  'Residential', 'The Broad Walk, Cheltenham, GL50 1QG', 47, 'Alison Archer'),

('H41',   'Heronden',
  'Heronden Apartments Management Company Limited',
  'Residential', '54 London Road, Cheltenham, GL52 6EQ', 13, 'Alison Archer'),

('G55',   'Grantspot',
  'Grantspot Residents Management Limited',
  'Residential', '15 Eldorado Road, Cheltenham, GL50 2PU', 4, 'Alison Archer'),

('G54',   'Glenowen House',
  'Glenowen Management Company Limited',
  'Residential', 'Lansdown Road, Cheltenham, GL50 2JA', 12, 'Alison Archer'),

('C97',   'The Cedars',
  'Cedars Larkhay Management Company Limited',
  'Residential', 'The Cedars, Hucclecote Road, Gloucester, GL3 3UA', 18, 'Alison Archer'),

('C107',  'Cotswold Chase',
  'Cotswold Chase Management Company (Gloucester) Limited',
  'Residential', 'Brockworth, Gloucester, GL3 4LW', 199, 'Alison Archer'),

('B98',   'Bleasby Gardens Apartments',
  'Bleasby (2000) Limited',
  'Residential', 'Bleasby Gardens, Lansdown Road, Cheltenham, GL51 6UL', 9, 'Alison Archer'),

('B102',  'Berkeley Lodge',
  'Berkeley Lodge Management Company Limited',
  'Residential', 'Berkeley Lodge, Hewlett Road, Cheltenham, GL52 6AA', 7, 'Alison Archer'),

('B101',  'Bleasby Gardens Estate',
  'Bleasby House (Managers) Limited',
  'Residential', 'Bleasby Gardens, Lansdown Road, Cheltenham, GL51 6UL', 16, 'Alison Archer')

ON CONFLICT (ref) DO NOTHING;
