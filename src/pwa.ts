import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

export async function checkForUpdates(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('当前浏览器不支持 PWA 更新')
  }
  if (!navigator.onLine) {
    throw new Error('当前没有网络，无法检查更新')
  }

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) {
    throw new Error('应用尚未完成离线缓存，请刷新后重试')
  }

  try {
    await registration.update()
  } catch {
    throw new Error('检查更新失败，请确认网络连接后重试')
  }
}
