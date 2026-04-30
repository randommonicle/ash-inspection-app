import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Android WebView has a bug where navigator.locks.request() completes its
// callback but the outer Promise never resolves. supabase-js uses Web Locks
// internally — this causes signInWithPassword to hang indefinitely.
// Removing navigator.locks forces supabase-js into its simple fallback path.
try {
  Object.defineProperty(navigator, 'locks', { value: undefined, writable: true, configurable: true })
} catch {
  try {
    Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true })
  } catch { /* ignore */ }
}

// CapacitorHttp patches window.fetch and its Promises never resolve.
// XHR is not patched, so we use an XHR-based fetch polyfill for all
// supabase-js internal calls (auth, database queries, storage, etc).
export function xhrFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : input.toString()
  return new Promise((resolve, reject) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()

    const xhr = new XMLHttpRequest()
    xhr.open(method, url, true)
    xhr.responseType = 'text'
    xhr.timeout = 30000

    const headers = init?.headers ?? (input instanceof Request ? input.headers : undefined)
    if (headers instanceof Headers) {
      headers.forEach((v, k) => xhr.setRequestHeader(k, v))
    } else if (Array.isArray(headers)) {
      headers.forEach(([k, v]) => xhr.setRequestHeader(k, v))
    } else if (headers) {
      Object.entries(headers as Record<string, string>).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    }

    xhr.onload = () => {
      const respHeaders = new Headers()
      xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach(line => {
        const idx = line.indexOf(': ')
        if (idx > 0) respHeaders.set(line.slice(0, idx), line.slice(idx + 2))
      })
      // 204/205/304 must not have a body — passing responseText throws
      const nullBody = [101, 204, 205, 304].includes(xhr.status)
      resolve(new Response(nullBody ? null : xhr.responseText, { status: xhr.status, statusText: xhr.statusText, headers: respHeaders }))
    }

    xhr.onerror   = () => reject(new TypeError('Network request failed'))
    xhr.ontimeout = () => reject(new TypeError('Network request timed out'))

    const body = init?.body ?? (input instanceof Request ? null : null)
    body ? xhr.send(body as XMLHttpRequestBodyInit) : xhr.send()
  })
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: xhrFetch },
  auth: {
    autoRefreshToken:    true,
    persistSession:      true,
    detectSessionInUrl:  false,
  },
})
