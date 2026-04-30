import { useState, useEffect, useCallback, useRef } from 'react'
import { Network } from '@capacitor/network'
import { syncPendingInspections } from '../services/sync'

export type SyncStatus = 'idle' | 'syncing' | 'queued' | 'error'

export function useSync() {
  const [status, setStatus] = useState<SyncStatus>('idle')
  const syncing = useRef(false)

  const triggerSync = useCallback(async () => {
    if (syncing.current) {
      console.log('[SYNC HOOK] Sync already in progress — skipping')
      return
    }
    syncing.current = true
    setStatus('syncing')
    try {
      await syncPendingInspections()
      setStatus('idle')
    } catch (err) {
      console.error('[SYNC HOOK] Sync failed:', err instanceof Error ? err.message : err)
      setStatus('error')
    } finally {
      syncing.current = false
    }
  }, [])

  // Auto-sync when network comes back online
  useEffect(() => {
    const handle = Network.addListener('networkStatusChange', async s => {
      if (s.connected) {
        console.log('[SYNC HOOK] Network restored — triggering sync')
        await triggerSync()
      } else {
        console.log('[SYNC HOOK] Network lost — queuing sync')
        setStatus('queued')
      }
    })
    return () => { handle.then(h => h.remove()) }
  }, [triggerSync])

  return { status, triggerSync }
}
