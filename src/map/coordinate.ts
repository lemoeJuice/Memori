import type { GeoPoint } from '../data/types'

export type MapCoordinate = readonly [longitude: number, latitude: number]
export type MapProviderName = 'amap' | 'wgs84'

const PI = Math.PI
const AXIS = 6378245.0
const ECCENTRICITY = 0.00669342162296594323

/** Convert stored WGS84 coordinates only at the provider rendering boundary. */
export function toMapCoordinate(point: Pick<GeoPoint, 'latitude' | 'longitude'>, provider: MapProviderName): MapCoordinate {
  if (provider !== 'amap' || !isInsideMainlandChina(point.longitude, point.latitude)) {
    return [point.longitude, point.latitude]
  }
  const delta = gcj02Offset(point.longitude, point.latitude)
  return [point.longitude + delta.longitude, point.latitude + delta.latitude]
}

export function isInsideMainlandChina(longitude: number, latitude: number): boolean {
  return longitude >= 72.004 && longitude <= 137.8347 && latitude >= 0.8293 && latitude <= 55.8271
}

function gcj02Offset(longitude: number, latitude: number): { longitude: number; latitude: number } {
  let latitudeOffset = transformLatitude(longitude - 105, latitude - 35)
  let longitudeOffset = transformLongitude(longitude - 105, latitude - 35)
  const radLatitude = latitude / 180 * PI
  let magic = Math.sin(radLatitude)
  magic = 1 - ECCENTRICITY * magic * magic
  const rootMagic = Math.sqrt(magic)
  latitudeOffset = latitudeOffset * 180 / ((AXIS * (1 - ECCENTRICITY)) / (magic * rootMagic) * PI)
  longitudeOffset = longitudeOffset * 180 / (AXIS / rootMagic * Math.cos(radLatitude) * PI)
  return { longitude: longitudeOffset, latitude: latitudeOffset }
}

function transformLatitude(x: number, y: number): number {
  let result = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  result += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3
  result += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3
  result += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3
  return result
}

function transformLongitude(x: number, y: number): number {
  let result = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  result += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3
  result += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3
  result += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3
  return result
}
