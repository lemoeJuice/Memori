export interface GeoPoint {
  latitude: number
  longitude: number
  source: 'exif' | 'current'
  accuracy?: number
}

export interface PhotoRef {
  id: string
  exifTakenAt?: number
}

export interface MemoryEntry {
  id: string
  createdAt: number
  updatedAt: number
  photo?: PhotoRef
  location?: GeoPoint
  placeLabel?: string
  text?: string
  favorite?: boolean
}

export interface StoredPhoto {
  id: string
  thumbnail: Blob
  original?: Blob
  mimeType: string
  fileName: string
  width: number
  height: number
  createdAt: number
}

export interface AppSettings {
  performanceMode: boolean
  backgroundPhotoId?: string
  backgroundDim: number
  backgroundBlur: number
  glassOpacity: number
  glassBlur: number
  cornerRadius: number
  theme: 'light' | 'system'
  imageQuality: number
  preserveOriginal: boolean
  maxImageDimension: number
  readExif: boolean
  locationEnabled: boolean
  preferExifLocation: boolean
  currentLocationFallback: boolean
  showCoordinates: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  performanceMode: false,
  backgroundDim: 8,
  backgroundBlur: 0,
  glassOpacity: 69,
  glassBlur: 18,
  cornerRadius: 24,
  theme: 'light',
  imageQuality: 82,
  preserveOriginal: true,
  maxImageDimension: 2400,
  readExif: true,
  locationEnabled: true,
  preferExifLocation: true,
  currentLocationFallback: true,
  showCoordinates: false,
}

export interface PhotoInput {
  file: File
  thumbnail: Blob
  original?: Blob
  width: number
  height: number
  exifTakenAt?: number
  exifLocation?: Omit<GeoPoint, 'source' | 'accuracy'>
}

export interface MemoryDraft {
  photo?: PhotoInput
  location?: GeoPoint
  placeLabel?: string
  text?: string
  createdAt?: number
}

export interface ExportArchive {
  schemaVersion: 1
  exportedAt: number
  entries: Array<MemoryEntry & { photoFile?: string; thumbnailFile?: string }>
  settings: AppSettings
  backgroundPhotoFile?: string
  backgroundThumbnailFile?: string
}
