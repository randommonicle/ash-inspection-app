import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'co.uk.ashproperty.inspection',
  appName: 'ASH Inspections',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Preferences: {
      group: 'co.uk.ashproperty.inspection',
    },
  },
}

export default config
