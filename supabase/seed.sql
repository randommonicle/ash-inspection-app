-- ASH Inspection App — Property Seed Data
-- Source: CSV exports from property management system, April 2026
-- 24 properties managed by Ben Graham + 31 managed by Pete Birch = 55 total
--
-- has_car_park = true: A41, A42, C105, G52, R42 (per spec section 11)
-- has_lift, has_roof_access: default false — update via app Property Detail screen
--
-- Run this after applying the migration:
--   supabase db seed  (via Supabase CLI)
--   or paste into the Supabase SQL Editor

INSERT INTO public.properties
  (ref, name, management_company, block_type, address, number_of_units, manager_name, has_car_park)
VALUES
  -- ── Ben Graham portfolio ─────────────────────────────────────────────────
  ('A41',  'Axiom Apartments',          'Elliot Oliver Asset Management Limited',                       'Commercial & Residential', '57-59 Winchcombe Street, Cheltenham, GL52 2NG',                  20,  'Ben Graham', true),
  ('A42',  'Albion',                    'Brightsplit 5 Limited',                                        'Residential',              'Southgate Street, Gloucester, GL1 1UJ',                          22,  'Ben Graham', true),
  ('B114', 'Brockhampton Park',         'Brockhampton Park Management Company Limited',                 'Residential',              'Brockhampton Park, Brockhampton, Cheltenham, GL54 5SP',           21,  'Ben Graham', false),
  ('B115', 'Beechwood Apartments',      'Cape Homes Limited',                                           'Residential',              'Gloucester Place, Cheltenham, GL52 2RF',                          9,   'Ben Graham', false),
  ('B117', '109-111 Bath Road',         '109/111 Bath Road Limited',                                    'Residential',              'Bath Road, Cheltenham, GL53 7LS',                                 19,  'Ben Graham', false),
  ('B119', 'Brampton Abbotts',          'Brampton Abbotts Management Company Limited',                  'Residential',              'St Michaels Grove, Brampton Abbotts, Ross-on-Wye, HR9 7YF',      10,  'Ben Graham', false),
  ('C100', 'Colebridge Court',          'Brightsplit 5 Limited',                                        'Residential',              'Cheltenham Road, Longlevens, Gloucester, GL2 0LX',                9,   'Ben Graham', false),
  ('C102', 'Colebridge Gardens',        'Brightsplit 5 Limited',                                        'Residential',              'Colebridge Gardens, Cheltenham Road, Longlevens, Gloucester, GL2 0LX', 21, 'Ben Graham', false),
  ('C103', 'Carrick Court',             'Carrick Court Limited',                                        'Residential',              'Lypiatt Road, Cheltenham, GL50 2QJ',                              12,  'Ben Graham', false),
  ('C105', 'Chelsea Square',            'Chelsea Square Management Limited',                            'Residential',              'St Georges Place, Cheltenham, GL50 3PW',                          84,  'Ben Graham', true),
  ('C110', 'Carlton Gate',              'CG (Cheltenham) Limited',                                      'Residential',              'Carlton Street, Cheltenham, GL52 6AQ',                            8,   'Ben Graham', false),
  ('D32',  'Douro House',               'DOURO HOUSE (CHELTENHAM) MANAGEMENT COMPANY LIMITED',          'Residential',              'Douro Road, Cheltenham, GL50 2PQ',                                8,   'Ben Graham', false),
  ('F40',  'The Firs',                  'ELLIOT OLIVER INVESTMENTS LIMITED',                            'Residential',              'Old Station Drive, Leckhampton, Cheltenham, GL53 0AU',            6,   'Ben Graham', false),
  ('G52',  'Glencairn Court',           'Glencairn Court Limited',                                      'Residential',              'Glencairn Court, Lansdown Road, Cheltenham, GL50 2NB',            46,  'Ben Graham', true),
  ('G53',  'Gainsborough House',        'Brightsplit 5 Limited',                                        'Commercial & Residential', '42-44 Bath Road, Cheltenham, GL53 7HW',                           13,  'Ben Graham', false),
  ('H84',  'Hatherley Court',           'Hatherley Court Management Limited',                           'Residential',              'Hatherley Court, Westal Park, Cheltenham, GL51 6EA',              15,  'Ben Graham', false),
  ('H85',  'Haywards Road',             'Cape Homes (Haywards Road) Limited',                           'Residential',              'Haywards Road, Charlton Kings, Cheltenham, GL52 6QP',             8,   'Ben Graham', false),
  ('L71',  '170-172 Leckhampton Road',  '170-172 Leckhampton Road Management Company Limited',          'Commercial & Residential', '170-172 Leckhampton Road, Cheltenham, GL53 0AA',                  15,  'Ben Graham', false),
  ('M73',  'Mariners Court',            'Elliot Oliver Asset Management Limited',                       'Residential',              'The Docks, Gloucester, GL1 2EH',                                  18,  'Ben Graham', false),
  ('R42',  'Redgrove Park',             'Redgrove Park Management Company Limited',                     'Residential',              'Redgrove Park, Cheltenham, Gloucestershire, GL51 6QY',            78,  'Ben Graham', true),
  ('S131', 'The Shortings',             'Bespoke Montpellier Investment Limited',                       'Residential',              'The Shortings, 1 Armscroft Road, Barnwood, Gloucester, GL2 0TF', 9,   'Ben Graham', false),
  ('U6',   'Upton''s Garden',           'Upton''s Garden Management Company Limited',                  'Residential',              'Whitminster, Gloucester, GL2 7LP',                                25,  'Ben Graham', false),
  ('W49',  'Westbourne House',          'THE WESTBOURNE HOUSE (CHELTENHAM) MANAGEMENT COMPANY LIMITED', 'Residential',              'Westbourne Drive, Cheltenham, Glos, GL52 2QQ',                    31,  'Ben Graham', false),
  ('Y6',   'Yeend House Apartments',    'Bespoke Montpellier Investments Ltd',                          'Residential',              'Knapp Road, Cheltenham, GL50 3QQ',                                9,   'Ben Graham', false),

  -- ── Pete Birch portfolio ─────────────────────────────────────────────────
  ('A19',    'Abbotsdene',              'Abbotsdene Management Company Limited',                                 'Residential',              '6 Cudnell Street, Charlton Kings, Cheltenham, GL53 8HT',                   5,   'Pete Birch', false),
  ('A38',    'Annecy Court',            'Annecy Court Management Company Limited',                               'Residential',              'Annecy Court, Queens Place, Cheltenham, GL51 7NZ',                         15,  'Pete Birch', false),
  ('A39',    'Albert Warehouse',        'Albert Management Company Limited',                                     'Residential',              'The Docks, Gloucester, GL1 2EE',                                           28,  'Pete Birch', false),
  ('B69',    'Bathville Mews',          'Bathville Mews Management Company Limited',                             'Residential',              'Bathville Mews, Cedar Court Road, Cheltenham, GL53 7RE',                   24,  'Pete Birch', false),
  ('B109',   'Barge Arm',              'The Barge Arm Management Company Limited',                               'Commercial & Residential', 'The Docks, Gloucester, GL1 2DN',                                           69,  'Pete Birch', false),
  ('B110',   'Barge Arm East',         'The Barge Arm East Management Company Limited',                          'Commercial & Residential', 'The Docks, Gloucester, GL1 2EH',                                           21,  'Pete Birch', false),
  ('B112',   'Biddle & Shipton',        'Biddle and Shipton Management Company Limited',                         'Commercial & Residential', 'The Docks, Gloucester, GL1 2BY',                                           34,  'Pete Birch', false),
  ('C109',   'Central Square Estate',   'Central Square (Stroud) Management Company Limited',                    'Residential',              'Greenaways, Ebley, Stroud, GL5 4UQ',                                       101, 'Pete Birch', false),
  ('C109G',  'Central Square G',        'Central Square (Stroud) Management Company Limited',                    'Residential',              'Greenaways, Ebley, Stroud, GL5 4UQ',                                       6,   'Pete Birch', false),
  ('C109H',  'Central Square H',        'Central Square (Stroud) Management Company Limited',                    'Residential',              'Greenaways, Ebley, Stroud, GL5 4UQ',                                       8,   'Pete Birch', false),
  ('C109J',  'Central Square J',        'Central Square (Stroud) Management Company Limited',                    'Residential',              'Greenaways, Ebley, Stroud, GL5 4UQ',                                       12,  'Pete Birch', false),
  ('C109K',  'Central Square K',        'Central Square (Stroud) Management Company Limited',                    'Residential',              'Greenaways, Ebley, Stroud, GL5 4UQ',                                       12,  'Pete Birch', false),
  ('C109L',  'Central Square L',        'Central Square (Stroud) Management Company Limited',                    'Commercial & Residential', 'Greenaways, Ebley, Stroud, GL5 4UQ',                                       7,   'Pete Birch', false),
  ('C109MN', 'Central Square MN',       'Central Square (Stroud) Management Company Limited',                    'Commercial & Residential', 'Greenaways, Ebley, Stroud, GL5 4UQ',                                       16,  'Pete Birch', false),
  ('D31',    'Double Reynolds',         'Double Reynolds Management Company Limited',                             'Residential',              'The Docks, Gloucester, GL1 2EN',                                           43,  'Pete Birch', false),
  ('D33',    'Dorchester Court',        'Dorchester Court Management Company Limited',                            'Residential',              'Dorchester Court, The Park, Cheltenham, GL50 2XN',                         12,  'Pete Birch', false),
  ('E30',    '24 Evesham Road',         '24 Evesham Road Management Co. Limited',                                 'Residential',              '24 Evesham Road, Cheltenham, GL52 2AB',                                    7,   'Pete Birch', false),
  ('E32',    'Edmonstone House',        'EDMONSTONE HOUSE (CHELTENHAM) MANAGEMENT COMPANY LIMITED',               'Residential',              'Edmonstone House, North Place, Cheltenham, GL50 4DS',                      9,   'Pete Birch', false),
  ('K11',    'Kings Quarter',           'KQ Estate Management Company Limited',                                   'Commercial & Residential', 'Whitefriars Apartments, 5 Market Parade, Gloucester, GL1 1RL',             20,  'Pete Birch', false),
  ('L12b',   '10 Lansdown Crescent',    'Miss V Langmead',                                                       'Residential',              '10 Lansdown Crescent, Cheltenham, GL50 2JY',                               5,   'Pete Birch', false),
  ('M70',    'Merchants Quay',          'Merchants Quay Residential Company Limited',                             'Commercial & Residential', 'The Docks, Gloucester, GL1 2EW',                                           51,  'Pete Birch', false),
  ('M72',    'Montpellier Courtyard',   'Montpellier Courtyard Residents Ltd.',                                   'Residential',              'The Courtyard, Montpellier Street, Cheltenham, GL50 1SR',                  10,  'Pete Birch', false),
  ('P57',    'Pridays Mill',            'Priday''s Mill Management Company Ltd',                                  'Commercial & Residential', '41-45 Commercial Road, Gloucester, GL1 2ED',                               41,  'Pete Birch', false),
  ('P60',    '23/25 Pittville Lawn',    'Seagrave Villas Management Company Limited',                             'Residential',              '23-25 Pittville Lawn, Cheltenham, GL52 2BE',                               11,  'Pete Birch', false),
  ('R50',    'Ridgeway Close',          'Ridgeway Close (Birdlip) Management Company Limited',                    'Residential',              'Ridgeway Close, Birdlip, Gloucester, GL4 8BN',                             16,  'Pete Birch', false),
  ('R52',    'Regal House',             'Regal House 2015 Management Limited',                                    'Residential',              '61 Rodney Road, Cheltenham, GL50 1HX',                                     11,  'Pete Birch', false),
  ('S129',   '117a St Georges Road',    '117a SGR Freehold Limited',                                              'Residential',              '117a St Georges Road, Cheltenham, GL50 3EG',                               9,   'Pete Birch', false),
  ('S132',   'Sandringham Court',       'Sandringham Court (Cheltenham) Limited',                                  'Residential',              'Sandringham Court, King Arthur Close, Charlton Park, Cheltenham, GL53 7EY', 8, 'Pete Birch', false),
  ('S133',   'Sandford Park House',     'Sandford Park House Management Ltd',                                     'Residential',              'Sandford Park House, 39-41 London Road, Cheltenham, GL52 6HE',             8,   'Pete Birch', false),
  ('S134',   '109 Southgate Street',    'Cypress Investments Limited',                                            'Residential',              '109 Southgate Street, Gloucester, GL1 1UT',                                21,  'Pete Birch', false),
  ('V9',     'Vinings Warehouse',       'Vinings Management Company Limited',                                     'Commercial & Residential', 'The Docks, Gloucester, GL1 2EG',                                           28,  'Pete Birch', false)
;
