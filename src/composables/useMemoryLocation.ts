import { computed, ref } from 'vue'
import { getCurrentLocation } from '../data/location'
import type { GeoPoint, MemoryEntry } from '../data/types'

type PhotoLocation = Pick<GeoPoint, 'latitude' | 'longitude'>

export function useMemoryLocation(existing?: MemoryEntry, locate = getCurrentLocation) {
  // Editing keeps saved coordinates until the user explicitly changes source.
  const recordCurrentLocation = ref(!existing || existing.location?.source === 'current')
  const currentLocation = ref(existing?.location?.source === 'current' ? { ...existing.location } : undefined)
  const photoLocation = ref<PhotoLocation | undefined>(existing?.photo?.exifLocation
    ? { ...existing.photo.exifLocation }
    : existing?.location?.source === 'exif' ? { latitude: existing.location.latitude, longitude: existing.location.longitude } : undefined)
  const locationBusy = ref(false)
  const locationFailed = ref(false)
  let requestToken = 0
  let disposed = false

  const location = computed<GeoPoint | undefined>(() => recordCurrentLocation.value
    ? currentLocation.value
    : photoLocation.value ? { ...photoLocation.value, source: 'exif' } : undefined)
  const locationStatus = computed(() => {
    if (!recordCurrentLocation.value) return photoLocation.value ? '正在使用照片位置' : '记录中将不包含位置信息'
    if (locationBusy.value) return '正在定位…'
    if (currentLocation.value) return '已记录当前位置'
    return locationFailed.value ? '定位暂不可用，记录中将不包含位置信息' : '记录中将不包含位置信息'
  })

  async function setRecordCurrentLocation(enabled: boolean) {
    const token = ++requestToken
    recordCurrentLocation.value = enabled
    locationBusy.value = false
    locationFailed.value = false
    if (!enabled) return
    currentLocation.value = undefined
    locationBusy.value = true
    try {
      const point = await locate()
      if (!disposed && token === requestToken && recordCurrentLocation.value) currentLocation.value = { ...point }
    } catch {
      if (!disposed && token === requestToken && recordCurrentLocation.value) locationFailed.value = true
    } finally {
      if (!disposed && token === requestToken) locationBusy.value = false
    }
  }

  function setPhotoLocation(point?: PhotoLocation) {
    photoLocation.value = point ? { latitude: point.latitude, longitude: point.longitude } : undefined
  }

  return {
    recordCurrentLocation, photoLocation, location, locationBusy, locationStatus,
    setRecordCurrentLocation, setPhotoLocation,
    start() {
      if (recordCurrentLocation.value && !currentLocation.value) void setRecordCurrentLocation(true)
    },
    dispose() { disposed = true; requestToken++; locationBusy.value = false },
  }
}
