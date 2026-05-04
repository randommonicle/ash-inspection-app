// Weather lookup for inspection reports.
// Uses two free, no-API-key services:
//   • Nominatim (OpenStreetMap) — geocodes the property address to lat/lon
//   • Open-Meteo — returns historical hourly weather for that location and time
//
// The forecast API covers the past 14 days (sufficient for same-day or next-day
// report generation). For older inspections the archive API is tried as a fallback.
// All errors are caught silently — a failed lookup just leaves the field blank.

const USER_AGENT = 'ASH-Inspection-App/1.0 (property-inspection-management; contact: ben@ashproperty.co.uk)'

// ── WMO weather code → human-readable description ────────────────────────────

function describeCode(code: number): string {
  if (code === 0)                        return 'Clear sky'
  if (code === 1)                        return 'Mainly clear'
  if (code === 2)                        return 'Partly cloudy'
  if (code === 3)                        return 'Overcast'
  if (code === 45 || code === 48)        return 'Foggy'
  if (code === 51 || code === 53)        return 'Drizzle'
  if (code === 55)                       return 'Heavy drizzle'
  if (code === 56 || code === 57)        return 'Freezing drizzle'
  if (code === 61 || code === 63)        return 'Rain'
  if (code === 65)                       return 'Heavy rain'
  if (code === 71 || code === 73)        return 'Snow'
  if (code === 75)                       return 'Heavy snow'
  if (code === 77)                       return 'Snow grains'
  if (code === 80 || code === 81)        return 'Rain showers'
  if (code === 82)                       return 'Heavy showers'
  if (code === 85 || code === 86)        return 'Snow showers'
  if (code === 95)                       return 'Thunderstorm'
  if (code === 96 || code === 99)        return 'Thunderstorm with hail'
  return 'Mixed conditions'
}

function describeWind(kmh: number): string {
  if (kmh < 6)  return 'Calm'
  if (kmh < 20) return `Light wind (${kmh} km/h)`
  if (kmh < 40) return `Moderate wind (${kmh} km/h)`
  if (kmh < 60) return `Strong wind (${kmh} km/h)`
  return `Very strong wind (${kmh} km/h)`
}

// ── Nominatim geocoding ───────────────────────────────────────────────────────

async function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=gb`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal:  AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json() as Array<{ lat: string; lon: string }>
    if (!data.length) return null
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
  } catch {
    return null
  }
}

// ── Open-Meteo hourly fetch ───────────────────────────────────────────────────

interface HourlyBlock {
  time:            string[]
  temperature_2m:  number[]
  weathercode:     number[]
  windspeed_10m:   number[]
}

async function fetchFromUrl(url: string): Promise<{ temperature: number; code: number; wind: number } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json() as { hourly?: HourlyBlock }
    if (!data.hourly?.time?.length) return null

    const { temperature_2m, weathercode, windspeed_10m } = data.hourly
    // Open-Meteo returns 24 entries (one per hour, 00–23 local time)
    // We use the index that matches the local hour of the inspection
    // (already baked into the URL as the date + timezone param)
    return {
      temperature: Math.round(temperature_2m[0] ?? 0),
      code:        weathercode[0] ?? 0,
      wind:        Math.round(windspeed_10m[0] ?? 0),
    }
  } catch {
    return null
  }
}

async function getHourlyWeather(
  lat: number,
  lon: number,
  isoDate: string,   // YYYY-MM-DD in UK local time
  hour: number,      // 0–23, UK local time
): Promise<{ temperature: number; code: number; wind: number } | null> {
  // Open-Meteo lets us request a single hour with start_hour / end_hour
  // (available in both forecast and archive APIs since 2024).
  const hourStr = `${isoDate}T${String(hour).padStart(2, '0')}:00`

  const base = new URLSearchParams({
    latitude:   lat.toFixed(4),
    longitude:  lon.toFixed(4),
    hourly:     'temperature_2m,weathercode,windspeed_10m',
    timezone:   'Europe/London',
    start_hour: hourStr,
    end_hour:   hourStr,
  }).toString()

  // Try the forecast API first (past 14 days, no delay), then the ERA5 archive
  const result =
    await fetchFromUrl(`https://api.open-meteo.com/v1/forecast?${base}&past_days=14`) ??
    await fetchFromUrl(`https://archive-api.open-meteo.com/v1/archive?${base}`)

  return result
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable weather string for a given property address and
 * inspection start time, e.g. "14°C, Partly cloudy, Light wind (12 km/h)".
 * Returns null if geocoding or weather lookup fails (non-fatal).
 */
export async function getWeatherForInspection(
  address: string,
  startTimeIso: string,   // UTC ISO string from Supabase
): Promise<string | null> {
  try {
    // Convert UTC start time → UK local date and hour
    const utcDate    = new Date(startTimeIso)
    const localHour  = parseInt(
      utcDate.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }),
      10,
    )
    const localParts = utcDate.toLocaleDateString('en-GB', {
      timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric',
    }).split('/')
    // toLocaleDateString en-GB returns DD/MM/YYYY
    const isoDate    = `${localParts[2]}-${localParts[1]}-${localParts[0]}`

    console.log(`[WEATHER] Looking up ${address} on ${isoDate} at ${localHour}:00 (UK local)`)

    const coords = await geocode(address)
    if (!coords) {
      console.warn(`[WEATHER] Could not geocode: "${address}"`)
      return null
    }
    console.log(`[WEATHER] Geocoded → ${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`)

    const w = await getHourlyWeather(coords.lat, coords.lon, isoDate, localHour)
    if (!w) {
      console.warn(`[WEATHER] No data returned for ${isoDate} ${localHour}:00`)
      return null
    }

    const result = `${w.temperature}°C, ${describeCode(w.code)}, ${describeWind(w.wind)}`
    console.log(`[WEATHER] Result: ${result}`)
    return result

  } catch (err) {
    console.warn('[WEATHER] Lookup failed (non-fatal):', err)
    return null
  }
}
