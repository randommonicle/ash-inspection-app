import { Router, type Request, type Response, type NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

// Basic-auth guard — username "admin", password from ADMIN_PASSWORD env var
function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    return res.status(503).send('Admin dashboard not configured (ADMIN_PASSWORD not set)')
  }

  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="ASH Admin"')
    return res.status(401).send('Authorisation required')
  }

  const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':')
  if (user !== 'admin' || pass !== adminPassword) {
    res.setHeader('WWW-Authenticate', 'Basic realm="ASH Admin"')
    return res.status(401).send('Invalid credentials')
  }

  next()
}

router.use(requireAdminAuth)

// ── Dashboard HTML ────────────────────────────────────────────────────────────

router.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html')
  res.send(DASHBOARD_HTML)
})

// ── API endpoints ─────────────────────────────────────────────────────────────

router.get('/api/stats', async (_req, res) => {
  const [
    { count: totalProperties },
    { count: totalPMs },
    { count: activeInspections },
    { count: completedThisMonth },
    { count: totalBugReports },
    { count: reportsGenerated },
  ] = await Promise.all([
    supabase.from('properties').select('*', { count: 'exact', head: true }),
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'inspector'),
    supabase.from('inspections').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('inspections').select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('end_time', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase.from('bug_reports').select('*', { count: 'exact', head: true }),
    supabase.from('inspections').select('*', { count: 'exact', head: true }).eq('status', 'report_generated'),
  ])

  res.json({
    totalProperties: totalProperties ?? 0,
    totalPMs: totalPMs ?? 0,
    activeInspections: activeInspections ?? 0,
    completedThisMonth: completedThisMonth ?? 0,
    reportsGenerated: reportsGenerated ?? 0,
    totalBugReports: totalBugReports ?? 0,
  })
})

router.get('/api/inspections/active', async (_req, res) => {
  const { data, error } = await supabase
    .from('inspections')
    .select(`
      id, start_time, weather,
      properties ( ref, name, address ),
      users ( full_name, job_title )
    `)
    .eq('status', 'active')
    .order('start_time', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

router.get('/api/inspections/recent', async (_req, res) => {
  const { data, error } = await supabase
    .from('inspections')
    .select(`
      id, status, start_time, end_time, report_docx_url, report_pdf_url,
      properties ( ref, name, address ),
      users ( full_name )
    `)
    .in('status', ['completed', 'report_generated'])
    .order('end_time', { ascending: false })
    .limit(25)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

router.get('/api/pms', async (_req, res) => {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, full_name, email, job_title, role, created_at')
    .order('full_name')

  if (error) return res.status(500).json({ error: error.message })

  // Attach last inspection date per PM
  const ids = (users ?? []).map(u => u.id)
  const { data: lastInspections } = await supabase
    .from('inspections')
    .select('inspector_id, start_time')
    .in('inspector_id', ids)
    .order('start_time', { ascending: false })

  const lastByPM: Record<string, string> = {}
  for (const ins of lastInspections ?? []) {
    if (!lastByPM[ins.inspector_id]) lastByPM[ins.inspector_id] = ins.start_time
  }

  const result = (users ?? []).map(u => ({
    ...u,
    last_inspection: lastByPM[u.id] ?? null,
  }))

  res.json(result)
})

router.get('/api/bugs', async (_req, res) => {
  const { data, error } = await supabase
    .from('bug_reports')
    .select('id, type, description, reporter_name, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

router.get('/api/properties', async (_req, res) => {
  const { data, error } = await supabase
    .from('properties')
    .select(`
      id, ref, name, address, number_of_units, management_company, block_type,
      has_car_park, has_lift, has_roof_access, manager_name
    `)
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data ?? [])
})

router.get('/api/costs', async (_req, res) => {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const yearStart  = new Date(new Date().getFullYear(), 0, 1).toISOString()

  const [allTime, thisMonth, thisYear, byService, byEndpoint, byMonth, recent] = await Promise.all([
    supabase.from('api_usage_log').select('cost_usd'),
    supabase.from('api_usage_log').select('cost_usd').gte('created_at', monthStart),
    supabase.from('api_usage_log').select('cost_usd').gte('created_at', yearStart),
    supabase.from('api_usage_log').select('service, cost_usd, input_tokens, output_tokens, audio_seconds'),
    supabase.from('api_usage_log').select('endpoint, cost_usd'),
    supabase.from('api_usage_log').select('created_at, cost_usd').order('created_at', { ascending: true }),
    supabase.from('api_usage_log')
      .select('created_at, service, model, endpoint, input_tokens, output_tokens, audio_seconds, cost_usd, users(full_name)')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const sum = (rows: { cost_usd: number }[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + Number(r.cost_usd), 0)

  // Aggregate by service
  const serviceMap: Record<string, { cost: number; calls: number; inputTokens: number; outputTokens: number; audioSeconds: number }> = {}
  for (const r of byService.data ?? []) {
    if (!serviceMap[r.service]) serviceMap[r.service] = { cost: 0, calls: 0, inputTokens: 0, outputTokens: 0, audioSeconds: 0 }
    serviceMap[r.service].cost         += Number(r.cost_usd)
    serviceMap[r.service].calls        += 1
    serviceMap[r.service].inputTokens  += r.input_tokens  ?? 0
    serviceMap[r.service].outputTokens += r.output_tokens ?? 0
    serviceMap[r.service].audioSeconds += Number(r.audio_seconds ?? 0)
  }

  // Aggregate by endpoint
  const endpointMap: Record<string, { cost: number; calls: number }> = {}
  for (const r of byEndpoint.data ?? []) {
    if (!endpointMap[r.endpoint]) endpointMap[r.endpoint] = { cost: 0, calls: 0 }
    endpointMap[r.endpoint].cost  += Number(r.cost_usd)
    endpointMap[r.endpoint].calls += 1
  }

  // Monthly trend — group by YYYY-MM
  const monthlyMap: Record<string, number> = {}
  for (const r of byMonth.data ?? []) {
    const key = r.created_at.slice(0, 7)
    monthlyMap[key] = (monthlyMap[key] ?? 0) + Number(r.cost_usd)
  }

  res.json({
    totals: {
      allTime:   sum(allTime.data),
      thisMonth: sum(thisMonth.data),
      thisYear:  sum(thisYear.data),
      calls:     (allTime.data ?? []).length,
    },
    byService:  Object.entries(serviceMap).map(([service, v])  => ({ service,  ...v })),
    byEndpoint: Object.entries(endpointMap).map(([endpoint, v]) => ({ endpoint, ...v })),
    monthly:    Object.entries(monthlyMap).sort().map(([month, cost]) => ({ month, cost })),
    recent:     recent.data ?? [],
  })
})

router.get('/api/costs/csv', async (_req, res) => {
  const { data, error } = await supabase
    .from('api_usage_log')
    .select('created_at, service, model, endpoint, input_tokens, output_tokens, audio_seconds, cost_usd, inspection_id, user_id')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  const rows = data ?? []
  const header = 'Date,Service,Model,Endpoint,Input Tokens,Output Tokens,Audio Seconds,Cost (USD),Inspection ID,User ID'
  const lines = rows.map(r =>
    [
      r.created_at,
      r.service,
      r.model,
      r.endpoint,
      r.input_tokens  ?? '',
      r.output_tokens ?? '',
      r.audio_seconds ?? '',
      Number(r.cost_usd).toFixed(6),
      r.inspection_id ?? '',
      r.user_id       ?? '',
    ].join(',')
  )

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="ASH_API_Costs_${new Date().toISOString().slice(0,10)}.csv"`)
  res.send([header, ...lines].join('\n'))
})

// ── Dashboard HTML (self-contained) ──────────────────────────────────────────

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ASH Admin Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            navy: '#0f1b2d',
            mid:  '#1e2d42',
            light:'#94a3b8',
          }
        }
      }
    }
  </script>
  <style>
    body { background: #0f1b2d; font-family: system-ui, sans-serif; }
    .card { background: #1e2d42; border: 1px solid #2d4060; }
    .badge-active  { background:#16a34a22; color:#4ade80; border:1px solid #4ade8044; }
    .badge-done    { background:#2563eb22; color:#60a5fa; border:1px solid #60a5fa44; }
    .badge-report  { background:#7c3aed22; color:#c084fc; border:1px solid #c084fc44; }
    .badge-bug     { background:#dc262622; color:#f87171; border:1px solid #f8717144; }
    .badge-suggest { background:#d9770622; color:#fb923c; border:1px solid #fb923c44; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    table { border-collapse: collapse; width: 100%; }
    th { color:#94a3b8; font-size:.75rem; text-transform:uppercase; letter-spacing:.05em; font-weight:600; padding:.75rem 1rem; text-align:left; border-bottom:1px solid #2d4060; }
    td { padding:.75rem 1rem; border-bottom:1px solid #1e2d4280; color:#cbd5e1; font-size:.875rem; }
    tr:last-child td { border-bottom:none; }
    tr:hover td { background:#ffffff08; }
    .tab { cursor:pointer; padding:.5rem 1rem; border-radius:.5rem; color:#94a3b8; font-size:.875rem; transition:all .15s; }
    .tab:hover { color:#e2e8f0; background:#ffffff08; }
    .tab.active { color:#e2e8f0; background:#2d4060; }
    .dot { width:8px;height:8px;border-radius:50%;display:inline-block; }
    .dot-green { background:#4ade80; box-shadow:0 0 6px #4ade80; }
    .dot-grey  { background:#475569; }
  </style>
</head>
<body class="min-h-screen text-slate-200">

  <!-- Header -->
  <header class="border-b border-slate-700/50" style="background:#0f1b2d">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div>
          <div class="text-xl font-bold tracking-widest text-white">ASH</div>
          <div class="text-xs text-slate-400 tracking-widest uppercase" style="margin-top:-2px">Chartered Surveyors</div>
        </div>
        <div class="w-px h-8 bg-slate-700"></div>
        <span class="text-slate-300 text-sm font-medium">Admin Dashboard</span>
      </div>
      <div class="flex items-center gap-3">
        <div id="refresh-indicator" class="hidden">
          <svg class="spin w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
        <span id="last-updated" class="text-xs text-slate-500"></span>
        <button onclick="loadAll()" class="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded border border-slate-700 hover:border-slate-500 transition">Refresh</button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-6 py-8 space-y-8">

    <!-- Stat cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <div class="card rounded-xl p-4">
        <div class="text-2xl font-bold text-white" id="stat-properties">—</div>
        <div class="text-xs text-slate-400 mt-1">Properties</div>
      </div>
      <div class="card rounded-xl p-4">
        <div class="text-2xl font-bold text-white" id="stat-pms">—</div>
        <div class="text-xs text-slate-400 mt-1">Inspectors</div>
      </div>
      <div class="card rounded-xl p-4">
        <div class="text-2xl font-bold text-green-400" id="stat-active">—</div>
        <div class="text-xs text-slate-400 mt-1">Active Now</div>
      </div>
      <div class="card rounded-xl p-4">
        <div class="text-2xl font-bold text-blue-400" id="stat-month">—</div>
        <div class="text-xs text-slate-400 mt-1">Done This Month</div>
      </div>
      <div class="card rounded-xl p-4">
        <div class="text-2xl font-bold text-purple-400" id="stat-reports">—</div>
        <div class="text-xs text-slate-400 mt-1">Reports Generated</div>
      </div>
      <div class="card rounded-xl p-4">
        <div class="text-2xl font-bold text-orange-400" id="stat-bugs">—</div>
        <div class="text-xs text-slate-400 mt-1">Bug Reports</div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex gap-2 flex-wrap">
      <button class="tab active" data-tab="active" onclick="switchTab('active')">Live Inspections</button>
      <button class="tab" data-tab="recent" onclick="switchTab('recent')">Recent Inspections</button>
      <button class="tab" data-tab="pms" onclick="switchTab('pms')">Inspectors</button>
      <button class="tab" data-tab="properties" onclick="switchTab('properties')">Properties</button>
      <button class="tab" data-tab="bugs" onclick="switchTab('bugs')">Bug Reports</button>
      <button class="tab" data-tab="costs" onclick="switchTab('costs')">Costs &amp; Usage</button>
    </div>

    <!-- Tab panels -->
    <div id="panel-active" class="tab-panel card rounded-xl overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-700/50 flex items-center gap-2">
        <span class="dot dot-green"></span>
        <span class="font-semibold text-white text-sm">Live Inspections</span>
        <span class="text-slate-400 text-xs ml-1">Auto-refreshes every 30 s</span>
      </div>
      <div id="active-body"><div class="p-8 text-center text-slate-500 text-sm">Loading…</div></div>
    </div>

    <div id="panel-recent" class="tab-panel card rounded-xl overflow-hidden hidden">
      <div class="px-6 py-4 border-b border-slate-700/50">
        <span class="font-semibold text-white text-sm">Recent Inspections</span>
        <span class="text-slate-400 text-xs ml-2">(last 25)</span>
      </div>
      <div id="recent-body"><div class="p-8 text-center text-slate-500 text-sm">Loading…</div></div>
    </div>

    <div id="panel-pms" class="tab-panel card rounded-xl overflow-hidden hidden">
      <div class="px-6 py-4 border-b border-slate-700/50">
        <span class="font-semibold text-white text-sm">Inspectors</span>
      </div>
      <div id="pms-body"><div class="p-8 text-center text-slate-500 text-sm">Loading…</div></div>
    </div>

    <div id="panel-properties" class="tab-panel card rounded-xl overflow-hidden hidden">
      <div class="px-6 py-4 border-b border-slate-700/50">
        <span class="font-semibold text-white text-sm">Properties</span>
      </div>
      <div id="properties-body"><div class="p-8 text-center text-slate-500 text-sm">Loading…</div></div>
    </div>

    <div id="panel-bugs" class="tab-panel card rounded-xl overflow-hidden hidden">
      <div class="px-6 py-4 border-b border-slate-700/50">
        <span class="font-semibold text-white text-sm">Bug Reports &amp; Suggestions</span>
      </div>
      <div id="bugs-body"><div class="p-8 text-center text-slate-500 text-sm">Loading…</div></div>
    </div>

    <div id="panel-costs" class="tab-panel hidden space-y-6">
      <!-- Cost summary cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card rounded-xl p-4">
          <div class="text-xl font-bold text-white" id="cost-alltime">—</div>
          <div class="text-xs text-slate-400 mt-1">All-time spend</div>
        </div>
        <div class="card rounded-xl p-4">
          <div class="text-xl font-bold text-yellow-400" id="cost-month">—</div>
          <div class="text-xs text-slate-400 mt-1">This month</div>
        </div>
        <div class="card rounded-xl p-4">
          <div class="text-xl font-bold text-blue-400" id="cost-year">—</div>
          <div class="text-xs text-slate-400 mt-1">This year</div>
        </div>
        <div class="card rounded-xl p-4">
          <div class="text-xl font-bold text-slate-300" id="cost-calls">—</div>
          <div class="text-xs text-slate-400 mt-1">Total API calls</div>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        <!-- By service -->
        <div class="card rounded-xl overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-700/50 font-semibold text-white text-sm">By Service</div>
          <div id="cost-by-service" class="p-4 text-slate-500 text-sm">Loading…</div>
        </div>
        <!-- By endpoint -->
        <div class="card rounded-xl overflow-hidden">
          <div class="px-5 py-4 border-b border-slate-700/50 font-semibold text-white text-sm">By Endpoint</div>
          <div id="cost-by-endpoint" class="p-4 text-slate-500 text-sm">Loading…</div>
        </div>
      </div>

      <!-- Monthly trend -->
      <div class="card rounded-xl overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <span class="font-semibold text-white text-sm">Monthly Spend</span>
          <a href="/admin/api/costs/csv" class="text-xs text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded border border-blue-800 hover:border-blue-600 transition">⬇ Download CSV</a>
        </div>
        <div id="cost-monthly" class="p-4 text-slate-500 text-sm">Loading…</div>
      </div>

      <!-- Recent calls log -->
      <div class="card rounded-xl overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-700/50">
          <span class="font-semibold text-white text-sm">Recent API Calls</span>
          <span class="text-slate-400 text-xs ml-2">(last 100)</span>
        </div>
        <div id="cost-recent" class="p-4 text-slate-500 text-sm">Loading…</div>
      </div>
    </div>

  </main>

<script>
  const BASE = ''

  function fmt(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
  }
  function duration(start, end) {
    const ms = (end ? new Date(end) : new Date()) - new Date(start)
    const h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000)
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm'
  }
  function empty(msg) {
    return '<div class="p-8 text-center text-slate-500 text-sm">' + msg + '</div>'
  }

  async function api(path) {
    const r = await fetch(BASE + '/admin' + path)
    if (!r.ok) throw new Error(r.statusText)
    return r.json()
  }

  async function loadStats() {
    try {
      const s = await api('/api/stats')
      document.getElementById('stat-properties').textContent = s.totalProperties
      document.getElementById('stat-pms').textContent        = s.totalPMs
      document.getElementById('stat-active').textContent     = s.activeInspections
      document.getElementById('stat-month').textContent      = s.completedThisMonth
      document.getElementById('stat-reports').textContent    = s.reportsGenerated
      document.getElementById('stat-bugs').textContent       = s.totalBugReports
    } catch(e) { console.error('stats', e) }
  }

  async function loadActive() {
    try {
      const data = await api('/api/inspections/active')
      const el = document.getElementById('active-body')
      if (!data.length) { el.innerHTML = empty('No inspections currently in progress'); return }
      el.innerHTML = '<table><thead><tr><th>Inspector</th><th>Property</th><th>Address</th><th>Started</th><th>Duration</th><th>Weather</th></tr></thead><tbody>' +
        data.map(r => \`<tr>
          <td><span class="dot dot-green mr-2"></span>\${r.users?.full_name ?? '—'}</td>
          <td><span class="font-medium text-white">\${r.properties?.name ?? '—'}</span><br><span class="text-slate-500 text-xs">\${r.properties?.ref ?? ''}</span></td>
          <td class="text-slate-400">\${r.properties?.address ?? '—'}</td>
          <td>\${fmt(r.start_time)}</td>
          <td class="text-green-400 font-medium">\${duration(r.start_time, null)}</td>
          <td class="text-slate-400">\${r.weather ?? '—'}</td>
        </tr>\`).join('') + '</tbody></table>'
    } catch(e) { document.getElementById('active-body').innerHTML = empty('Failed to load') }
  }

  async function loadRecent() {
    try {
      const data = await api('/api/inspections/recent')
      const el = document.getElementById('recent-body')
      if (!data.length) { el.innerHTML = empty('No completed inspections yet'); return }
      el.innerHTML = '<table><thead><tr><th>Inspector</th><th>Property</th><th>Completed</th><th>Duration</th><th>Status</th><th>Report</th></tr></thead><tbody>' +
        data.map(r => {
          const badge = r.status === 'report_generated'
            ? '<span class="badge-report text-xs px-2 py-0.5 rounded-full">Report sent</span>'
            : '<span class="badge-done text-xs px-2 py-0.5 rounded-full">Completed</span>'
          const pdfLink = r.report_pdf_url
            ? \`<a href="\${r.report_pdf_url}" target="_blank" class="text-blue-400 hover:text-blue-300 underline text-xs">PDF</a>\`
            : '<span class="text-slate-600 text-xs">—</span>'
          return \`<tr>
            <td>\${r.users?.full_name ?? '—'}</td>
            <td><span class="font-medium text-white">\${r.properties?.name ?? '—'}</span><br><span class="text-slate-500 text-xs">\${r.properties?.ref ?? ''}</span></td>
            <td>\${fmt(r.end_time)}</td>
            <td class="text-slate-400">\${r.start_time && r.end_time ? duration(r.start_time, r.end_time) : '—'}</td>
            <td>\${badge}</td>
            <td>\${pdfLink}</td>
          </tr>\`
        }).join('') + '</tbody></table>'
    } catch(e) { document.getElementById('recent-body').innerHTML = empty('Failed to load') }
  }

  async function loadPMs() {
    try {
      const data = await api('/api/pms')
      const el = document.getElementById('pms-body')
      if (!data.length) { el.innerHTML = empty('No users found'); return }
      el.innerHTML = '<table><thead><tr><th>Name</th><th>Email</th><th>Job Title</th><th>Role</th><th>Last Inspection</th><th>Joined</th></tr></thead><tbody>' +
        data.map(r => \`<tr>
          <td class="font-medium text-white">\${r.full_name}</td>
          <td class="text-slate-400">\${r.email}</td>
          <td class="text-slate-400">\${r.job_title ?? 'Property Manager'}</td>
          <td>\${r.role === 'admin' ? '<span class="badge-report text-xs px-2 py-0.5 rounded-full">Admin</span>' : '<span class="text-slate-400 text-xs">Inspector</span>'}</td>
          <td>\${r.last_inspection ? fmt(r.last_inspection) : '<span class="text-slate-600">Never</span>'}</td>
          <td class="text-slate-500">\${fmt(r.created_at)}</td>
        </tr>\`).join('') + '</tbody></table>'
    } catch(e) { document.getElementById('pms-body').innerHTML = empty('Failed to load') }
  }

  async function loadProperties() {
    try {
      const data = await api('/api/properties')
      const el = document.getElementById('properties-body')
      if (!data.length) { el.innerHTML = empty('No properties found'); return }
      el.innerHTML = '<table><thead><tr><th>Ref</th><th>Name</th><th>Address</th><th>Manager</th><th>Units</th><th>Features</th></tr></thead><tbody>' +
        data.map(r => {
          const features = [
            r.has_car_park   ? '<span title="Car park" class="text-slate-300">P</span>'   : '',
            r.has_lift       ? '<span title="Lift" class="text-slate-300">L</span>'       : '',
            r.has_roof_access? '<span title="Roof access" class="text-slate-300">R</span>': '',
          ].filter(Boolean).join(' · ') || '<span class="text-slate-600">—</span>'
          return \`<tr>
            <td class="font-mono text-xs text-slate-400">\${r.ref}</td>
            <td class="font-medium text-white">\${r.name}</td>
            <td class="text-slate-400 text-xs">\${r.address}</td>
            <td class="text-slate-400">\${r.manager_name}</td>
            <td class="text-slate-400 text-center">\${r.number_of_units}</td>
            <td class="text-xs font-medium">\${features}</td>
          </tr>\`
        }).join('') + '</tbody></table>'
    } catch(e) { document.getElementById('properties-body').innerHTML = empty('Failed to load') }
  }

  function usd(v) { return v < 0.01 ? '<$0.01' : '$' + v.toFixed(4) }
  function bar(frac, colour) {
    const pct = Math.round(frac * 100)
    return \`<div class="flex items-center gap-2"><div class="flex-1 bg-slate-700 rounded-full h-1.5"><div class="h-1.5 rounded-full \${colour}" style="width:\${pct}%"></div></div><span class="text-xs w-8 text-right text-slate-400">\${pct}%</span></div>\`
  }

  async function loadCosts() {
    try {
      const d = await api('/api/costs')

      document.getElementById('cost-alltime').textContent = usd(d.totals.allTime)
      document.getElementById('cost-month').textContent   = usd(d.totals.thisMonth)
      document.getElementById('cost-year').textContent    = usd(d.totals.thisYear)
      document.getElementById('cost-calls').textContent   = d.totals.calls.toLocaleString()

      // By service
      const maxSvc = Math.max(...d.byService.map(s => s.cost), 0.000001)
      document.getElementById('cost-by-service').innerHTML = d.byService.length
        ? d.byService.sort((a,b) => b.cost - a.cost).map(s => \`
          <div class="mb-4">
            <div class="flex justify-between mb-1">
              <span class="font-medium text-slate-200 capitalize">\${s.service}</span>
              <span class="text-slate-300 font-mono">\${usd(s.cost)}</span>
            </div>
            \${bar(s.cost / maxSvc, s.service === 'anthropic' ? 'bg-purple-500' : 'bg-green-500')}
            <div class="text-xs text-slate-500 mt-1">
              \${s.calls} calls
              \${s.inputTokens  ? '· ' + (s.inputTokens/1000).toFixed(1)  + 'K input tokens'  : ''}
              \${s.outputTokens ? '· ' + (s.outputTokens/1000).toFixed(1) + 'K output tokens' : ''}
              \${s.audioSeconds ? '· ' + (s.audioSeconds/60).toFixed(1)   + ' min audio'      : ''}
            </div>
          </div>\`).join('')
        : '<p class="text-slate-500 text-sm">No data yet</p>'

      // By endpoint
      const maxEp = Math.max(...d.byEndpoint.map(e => e.cost), 0.000001)
      document.getElementById('cost-by-endpoint').innerHTML = d.byEndpoint.length
        ? d.byEndpoint.sort((a,b) => b.cost - a.cost).map(e => \`
          <div class="mb-3">
            <div class="flex justify-between mb-1">
              <span class="font-mono text-xs text-slate-300">\${e.endpoint}</span>
              <span class="text-slate-300 font-mono text-sm">\${usd(e.cost)}</span>
            </div>
            \${bar(e.cost / maxEp, 'bg-blue-500')}
            <div class="text-xs text-slate-500 mt-0.5">\${e.calls} calls</div>
          </div>\`).join('')
        : '<p class="text-slate-500 text-sm">No data yet</p>'

      // Monthly trend table
      document.getElementById('cost-monthly').innerHTML = d.monthly.length
        ? '<table><thead><tr><th>Month</th><th>Spend (USD)</th><th>Trend</th></tr></thead><tbody>' +
          d.monthly.slice().reverse().map(m => {
            const maxM = Math.max(...d.monthly.map(x => x.cost), 0.000001)
            const pct  = Math.round((m.cost / maxM) * 100)
            return \`<tr>
              <td class="font-mono text-slate-300">\${m.month}</td>
              <td class="font-mono text-white">\${usd(m.cost)}</td>
              <td class="w-48"><div class="bg-slate-700 rounded h-1.5"><div class="bg-yellow-500 h-1.5 rounded" style="width:\${pct}%"></div></div></td>
            </tr>\`
          }).join('') + '</tbody></table>'
        : '<p class="text-slate-500 text-sm text-center py-4">No usage recorded yet — API calls will appear here once the first inspection is processed.</p>'

      // Recent calls
      document.getElementById('cost-recent').innerHTML = d.recent.length
        ? '<table><thead><tr><th>Time</th><th>Service</th><th>Endpoint</th><th>In</th><th>Out</th><th>Audio</th><th>Cost</th></tr></thead><tbody>' +
          d.recent.map(r => \`<tr>
            <td class="text-slate-500 text-xs whitespace-nowrap">\${fmt(r.created_at)}</td>
            <td><span class="text-xs px-1.5 py-0.5 rounded \${r.service === 'anthropic' ? 'badge-report' : 'badge-done'}">\${r.service}</span></td>
            <td class="font-mono text-xs text-slate-400">\${r.endpoint}</td>
            <td class="text-slate-400 text-xs">\${r.input_tokens  ? (r.input_tokens /1000).toFixed(1)+'K' : '—'}</td>
            <td class="text-slate-400 text-xs">\${r.output_tokens ? (r.output_tokens/1000).toFixed(1)+'K' : '—'}</td>
            <td class="text-slate-400 text-xs">\${r.audio_seconds ? Number(r.audio_seconds).toFixed(1)+'s' : '—'}</td>
            <td class="font-mono text-white text-xs">\${usd(r.cost_usd)}</td>
          </tr>\`).join('') + '</tbody></table>'
        : '<p class="text-slate-500 text-sm text-center py-4">No API calls logged yet.</p>'

    } catch(e) {
      console.error('costs', e)
      document.getElementById('cost-monthly').innerHTML = '<p class="text-red-400 text-sm">Failed to load cost data</p>'
    }
  }

  async function loadBugs() {
    try {
      const data = await api('/api/bugs')
      const el = document.getElementById('bugs-body')
      if (!data.length) { el.innerHTML = empty('No bug reports yet'); return }
      el.innerHTML = '<table><thead><tr><th>Type</th><th>From</th><th>Description</th><th>Submitted</th></tr></thead><tbody>' +
        data.map(r => {
          const badge = r.type === 'bug'
            ? '<span class="badge-bug text-xs px-2 py-0.5 rounded-full">Bug</span>'
            : '<span class="badge-suggest text-xs px-2 py-0.5 rounded-full">Suggestion</span>'
          return \`<tr>
            <td>\${badge}</td>
            <td class="text-slate-300">\${r.reporter_name}</td>
            <td class="text-slate-400 max-w-md" style="white-space:pre-wrap">\${r.description}</td>
            <td class="text-slate-500 text-xs whitespace-nowrap">\${fmt(r.created_at)}</td>
          </tr>\`
        }).join('') + '</tbody></table>'
    } catch(e) { document.getElementById('bugs-body').innerHTML = empty('Failed to load') }
  }

  let activeTab = 'active'
  function switchTab(tab) {
    activeTab = tab
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== 'panel-' + tab))
  }

  async function loadAll() {
    document.getElementById('refresh-indicator').classList.remove('hidden')
    await Promise.all([loadStats(), loadActive(), loadRecent(), loadPMs(), loadProperties(), loadBugs(), loadCosts()])
    document.getElementById('refresh-indicator').classList.add('hidden')
    document.getElementById('last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
  }

  loadAll()
  // Auto-refresh every 30 seconds
  setInterval(loadAll, 30000)
</script>
</body>
</html>`

export default router
