import { useState, useEffect } from 'react'
import { Network } from '@capacitor/network'

export function useNetwork() {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    Network.getStatus().then(s => setOnline(s.connected))
    const handle = Network.addListener('networkStatusChange', s => setOnline(s.connected))
    return () => { handle.then(h => h.remove()) }
  }, [])

  return online
}
