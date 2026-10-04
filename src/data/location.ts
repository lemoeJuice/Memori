import * as exifr from 'exifr'
import type { GeoPoint } from './types'

export async function readExifLocation(file: File): Promise<{ latitude: number; longitude: number } | undefined> {
  try {
    const gps = await exifr.gps(file)
    if (typeof gps?.latitude !== 'number' || typeof gps?.longitude !== 'number') return undefined
    if (!Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) return undefined
    return { latitude: gps.latitude, longitude: gps.longitude }
  } catch {
    return undefined
  }
}

export function getCurrentLocation(timeout = 12000): Promise<GeoPoint> {
  if (!('geolocation' in navigator)) return Promise.reject(new Error('此浏览器不支持定位'))
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, source: 'current' }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED ? '定位权限未开启' : error.code === error.TIMEOUT ? '定位超时' : '暂时无法获取位置')),
      { enableHighAccuracy: false, timeout, maximumAge: 120000 },
    )
  })
}

export function isValidPoint(point: Pick<GeoPoint, 'latitude' | 'longitude'>): boolean {
  return Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180
}
