import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'co.uk.ashproperty.inspection',
  appName: 'ASH Inspections',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // TODO [PRODUCTION]: Replace the local IP with the production server's domain,
    // e.g. allowNavigation: ['api.ashproperty.co.uk']
    // The IP entry only exists to allow the app to reach the Express server over
    // the local network during development and Cloudflare-tunnel field testing.
    allowNavigation: ['192.168.1.108'],
  },
  android: {
    // TODO [PRODUCTION]: Remove allowMixedContent once the Express server is deployed
    // behind HTTPS (Railway/Render). Mixed content allows the app (served over https://)
    // to make requests to plain http:// endpoints — only safe on a trusted local network.
    allowMixedContent: true,
  },
  plugins: {
    Preferences: {
      group: 'co.uk.ashproperty.inspection',
    },
  },
}

export default config
