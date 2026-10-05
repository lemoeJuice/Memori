import type { MapSettings } from './settings'

export function configureAmapSecurity({ serviceHost, securityJsCode }: MapSettings): void {
  if (serviceHost) {
    window._AMapSecurityConfig = { serviceHost }
  } else if (securityJsCode) {
    window._AMapSecurityConfig = { securityJsCode }
  } else {
    delete window._AMapSecurityConfig
  }
}
