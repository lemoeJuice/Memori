export function configureAmapSecurity(): void {
  const serviceHost = import.meta.env.VITE_AMAP_SERVICE_HOST
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_CODE
  if (serviceHost) {
    window._AMapSecurityConfig = { serviceHost }
  } else if (securityJsCode) {
    window._AMapSecurityConfig = { securityJsCode }
  }
}
