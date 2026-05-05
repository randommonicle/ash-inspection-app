// ─── Supabase / remote types ──────────────────────────────────────────────────

export interface Property {
  id: string
  ref: string
  name: string
  management_company: string
  block_type: string
  address: string
  number_of_units: number
  manager_name: string
  has_car_park: boolean
  has_lift: boolean
  has_roof_access: boolean
  created_at: string
}

export interface UserProfile {
  id: string
  full_name: string
  email: string
  role: 'inspector' | 'admin'
  created_at: string
}

// ─── Section keys ─────────────────────────────────────────────────────────────

export type SectionKey =
  | 'external_approach'
  | 'grounds'
  | 'bin_store'
  | 'car_park'
  | 'external_fabric'
  | 'roof'
  | 'communal_entrance'
  | 'stairwells'
  | 'lifts'
  | 'plant_room'
  | 'internal_communal'
  | 'additional'

export const SECTION_LABELS: Record<SectionKey, string> = {
  external_approach: 'External Approach & Entrance',
  grounds:           'Grounds & Landscaping',
  bin_store:         'Bin Store & Waste Facilities',
  car_park:          'Car Park',
  external_fabric:   'External Fabric & Elevations',
  roof:              'Roof & Roof Terrace',
  communal_entrance: 'Communal Entrance & Reception',
  stairwells:        'Stairwells & Circulation',
  lifts:             'Lifts',
  plant_room:        'Plant Room & Utilities',
  internal_communal: 'Internal Communal Areas',
  additional:        'Additional / Property-Specific',
}

export const SECTION_ORDER: SectionKey[] = [
  'external_approach', 'grounds', 'bin_store', 'car_park',
  'external_fabric', 'roof', 'communal_entrance', 'stairwells',
  'lifts', 'plant_room', 'internal_communal', 'additional',
]

export const SECTION_TEMPLATE_ORDER: Record<SectionKey, number> = {
  external_approach: 1, grounds: 2, bin_store: 3, car_park: 4,
  external_fabric: 5, roof: 6, communal_entrance: 7, stairwells: 8,
  lifts: 9, plant_room: 10, internal_communal: 11, additional: 12,
}

// ─── Local (SQLite) types ─────────────────────────────────────────────────────

export interface LocalInspection {
  id: string
  property_id: string
  property_ref: string
  property_name: string
  property_address: string
  inspector_id: string
  status: 'active' | 'completed'
  start_time: string
  end_time?: string
  synced: boolean
  report_sent: boolean
  created_at: string
}

export interface LocalObservation {
  id: string
  inspection_id: string
  property_id: string
  section_key: SectionKey
  template_order: number
  raw_narration: string
  processed_text?: string
  action_text?: string
  risk_level?: 'High' | 'Medium' | 'Low'
  classification_conf?: 'auto' | 'manual'
  synced: boolean
  created_at: string
}

export interface LocalPhoto {
  id: string
  observation_id?: string
  inspection_id: string
  local_path: string       // filesystem URI
  web_path?: string        // Capacitor.convertFileSrc result for display
  caption?: string
  section_key?: string     // Opus-assigned section, written back after sync
  synced: boolean
  created_at: string
}

export interface PendingTranscription {
  id: string
  inspection_id: string
  audio_path: string       // filesystem URI of saved audio blob
  created_at: string
}
