import { readonly, shallowRef } from 'vue'

export interface MapSettings {
  key: string
  securityJsCode: string
  serviceHost: string
}

const STORAGE_KEY = 'memori.map-service.v1'
const emptySettings = (): MapSettings => ({ key: '', securityJsCode: '', serviceHost: '' })

export function normalizeMapSettings(value: Partial<MapSettings>): MapSettings {
  return {
    key: typeof value.key === 'string' ? value.key.trim() : '',
    securityJsCode: typeof value.securityJsCode === 'string' ? value.securityJsCode.trim() : '',
    serviceHost: typeof value.serviceHost === 'string' ? value.serviceHost.trim() : '',
  }
}

function readSettings(): MapSettings {
  try { return normalizeMapSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') ?? {}) }
  catch { return emptySettings() }
}

const savedSettings = shallowRef<MapSettings>(readSettings())
export const mapSettings = readonly(savedSettings)

export function saveMapSettings(value: MapSettings): void {
  const normalized = normalizeMapSettings(value)
  // Keep credentials separate from AppSettings, IndexedDB memories and backups.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  savedSettings.value = normalized
}

export function validateMapSettings(value: MapSettings): void {
  if (!value.key) throw new Error('请先填写高德 Web Key。')
  if (!value.serviceHost && !value.securityJsCode) throw new Error('请填写 securityJsCode，或配置 serviceHost 代理。')
  if (value.serviceHost) {
    let url: URL
    try { url = new URL(value.serviceHost) } catch { throw new Error('serviceHost 必须是完整的 HTTP(S) 代理地址。') }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('serviceHost 必须是无账号、查询参数和片段的 HTTP(S) 地址。')
    }
    if (location.protocol === 'https:' && url.protocol !== 'https:') throw new Error('当前页面使用 HTTPS，代理地址也需要使用 HTTPS。')
  }
}
