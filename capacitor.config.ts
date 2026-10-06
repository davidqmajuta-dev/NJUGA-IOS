import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.njugacasino.game',
  appName: 'NJUGA/CASINO',
  webDir: 'www',
  bundledWebRuntime: false,
  backgroundColor: '#0B3D2E',
  android: {
    backgroundColor: '#101318'
  },
  ios: {
    // The game handles notch / Dynamic Island / home-indicator spacing itself
    // with CSS env(safe-area-inset-*), so let the web view run edge-to-edge.
    contentInset: 'never',
    backgroundColor: '#0B3D2E',
    scrollEnabled: false,
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
    scheme: 'NJUGA'
  },
  plugins: {
    StatusBar: { style: 'DARK', overlaysWebView: true }
  }
};

export default config;
