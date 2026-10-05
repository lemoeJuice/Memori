import { configureAmapSecurity } from './amap-security'
import { validateMapSettings, type MapSettings } from './settings'
import type { AMapApi } from './amap-provider'

export const MAP_LOAD_ERROR = '地图加载失败，请检查网络、Web Key、安全密钥或代理配置，以及高德控制台的域名白名单，然后重试。'

let activeConfig = ''
let pending: Promise<AMapApi> | undefined
let cancel: (() => void) | undefined
let sequence = 0

// Each attempt has a unique callback: late responses cannot complete a newer load.
// Tests and MapView share the same attempt when their saved configuration matches.
export function loadAmap(settings: MapSettings): Promise<AMapApi> {
  validateMapSettings(settings)
  const config = JSON.stringify(settings)
  if (pending && config === activeConfig) return pending
  cancel?.()
  activeConfig = config
  configureAmapSecurity(settings)
  const globals = window as unknown as Record<string, unknown>
  delete globals.AMap
  const callback = `__memoriAmapLoaded${++sequence}`
  const script = document.createElement('script')
  const attempt = new Promise<AMapApi>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      script.remove()
      delete globals[callback]
      cancel = undefined
    }
    const fail = () => {
      cleanup()
      reject(new Error(MAP_LOAD_ERROR))
    }
    const timer = window.setTimeout(fail, 20000)
    cancel = fail
    globals[callback] = (error?: unknown) => {
      const api = globals.AMap as AMapApi | undefined
      if (error || !api?.Map) { fail(); return }
      cleanup()
      resolve(api)
    }
    script.onerror = fail
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(settings.key)}&callback=${callback}`
    document.head.appendChild(script)
  })
  pending = attempt
  void attempt.catch(() => { if (pending === attempt) pending = undefined })
  return attempt
}
