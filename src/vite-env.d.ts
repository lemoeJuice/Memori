/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
  _AMapSecurityConfig?: {
    securityJsCode?: string
    serviceHost?: string
  }
}
