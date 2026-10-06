import { DEFAULT_SETTINGS, type AppSettings, type CompressionQuality } from './types'

type SavedSettings = Partial<AppSettings> & {
  preserveOriginal?: boolean
  imageQuality?: number
  maxImageDimension?: number
  locationEnabled?: boolean
  preferExifLocation?: boolean
  currentLocationFallback?: boolean
}

/** Used for both IndexedDB and backups, including settings from older versions. */
export function normalizeSettings(saved?: SavedSettings | null): AppSettings {
  const {
    preserveOriginal, imageQuality,
    maxImageDimension: _dimension, locationEnabled: _enabled,
    preferExifLocation: _preferExif, currentLocationFallback: _fallback,
    ...current
  } = saved ?? {}
  const legacyQuality: CompressionQuality = typeof imageQuality === 'number'
    ? imageQuality < 70 ? 'compact' : imageQuality >= 90 ? 'clear' : 'balanced'
    : DEFAULT_SETTINGS.compressionQuality
  const quality = current.compressionQuality
  return {
    ...DEFAULT_SETTINGS,
    ...current,
    compressPhotos: typeof current.compressPhotos === 'boolean'
      ? current.compressPhotos
      : typeof preserveOriginal === 'boolean' ? !preserveOriginal : DEFAULT_SETTINGS.compressPhotos,
    compressionQuality: quality === 'compact' || quality === 'balanced' || quality === 'clear'
      ? quality : legacyQuality,
  }
}
