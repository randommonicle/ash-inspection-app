import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'co.uk.ashproperty.inspection',
  appName: 'ASH Inspections',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    allowNavigation: ['192.168.1.108'],
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    Preferences: {
      group: 'co.uk.ashproperty.inspection',
    },
  },
}

export default config
