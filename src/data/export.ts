import JSZip from 'jszip'
import { getAllEntries, getPhoto, getSettings, replaceAllData } from './database'
import { DEFAULT_SETTINGS, type AppSettings, type ExportArchive, type MemoryEntry, type StoredPhoto } from './types'

const MAX_IMPORT_BYTES = 250 * 1024 * 1024

export async function exportBackup(): Promise<Blob> {
  const entries = await getAllEntries()
  const settings = await getSettings()
  const zip = new JSZip()
  const exportedEntries: ExportArchive['entries'] = []
  for (const entry of entries) {
    const copy: ExportArchive['entries'][number] = { ...entry }
    if (entry.photo) {
      const photo = await getPhoto(entry.photo.id)
      if (photo) {
        const extension = extensionForMime(photo.original?.type || photo.thumbnail.type)
        copy.thumbnailFile = `photos/${photo.id}-thumb.webp`
        zip.file(copy.thumbnailFile, photo.thumbnail)
        if (photo.original) {
          copy.photoFile = `photos/${photo.id}.${extension}`
          zip.file(copy.photoFile, photo.original)
        }
      }
    }
    exportedEntries.push(copy)
  }
  const archive: ExportArchive = { schemaVersion: 1, exportedAt: Date.now(), entries: exportedEntries, settings }
  if (settings.backgroundPhotoId) {
    const background = await getPhoto(settings.backgroundPhotoId)
    if (background) {
      archive.backgroundThumbnailFile = `photos/${background.id}.${extensionForMime(background.mimeType || background.thumbnail.type)}`
      zip.file(archive.backgroundThumbnailFile, background.thumbnail)
      if (background.original) {
        archive.backgroundPhotoFile = `photos/${background.id}-original.${extensionForMime(background.original.type)}`
        zip.file(archive.backgroundPhotoFile, background.original)
      }
    }
  }
  zip.file('memori-backup.json', JSON.stringify(archive, null, 2))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } })
}

export async function importBackup(file: File): Promise<number> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('备份文件过大（最大 250 MB）')
  const zip = await JSZip.loadAsync(file)
  const manifest = zip.file('memori-backup.json')
  if (!manifest) throw new Error('这不是有效的 Memori 备份文件')
  const data = JSON.parse(await manifest.async('string')) as Partial<ExportArchive>
  if (data.schemaVersion !== 1 || !Array.isArray(data.entries)) throw new Error('暂不支持此备份版本')
  const photos: StoredPhoto[] = []
  const entries: MemoryEntry[] = data.entries.map((entry) => {
    if (!entry?.id || !Number.isFinite(entry.createdAt)) throw new Error('备份中包含无效记录')
    return { ...entry }
  })
  for (const entry of entries) {
    const source = data.entries.find((item) => item.id === entry.id)
    if (!entry.photo || !source) continue
    const thumbPath = source.thumbnailFile
    const originalPath = source.photoFile
    const thumb = thumbPath ? zip.file(thumbPath) : null
    if (!thumb) {
      delete entry.photo
      continue
    }
    const thumbnail = blobWithPathMime(await thumb.async('blob'), thumbPath!)
    const originalEntry = originalPath ? zip.file(originalPath) : null
    const original = originalEntry ? blobWithPathMime(await originalEntry.async('blob'), originalPath!) : undefined
    photos.push({
      id: entry.photo.id,
      thumbnail,
      original,
      mimeType: original?.type || thumbnail.type || 'image/webp',
      fileName: `${entry.photo.id}.${extensionForMime(original?.type || thumbnail.type)}`,
      width: 0,
      height: 0,
      createdAt: entry.createdAt,
    })
  }
  if (data.settings?.backgroundPhotoId && data.backgroundThumbnailFile) {
    const thumbnailEntry = zip.file(data.backgroundThumbnailFile)
    if (thumbnailEntry && !photos.some((photo) => photo.id === data.settings?.backgroundPhotoId)) {
      const thumbnail = blobWithPathMime(await thumbnailEntry.async('blob'), data.backgroundThumbnailFile)
      const originalEntry = data.backgroundPhotoFile ? zip.file(data.backgroundPhotoFile) : null
      const original = originalEntry ? blobWithPathMime(await originalEntry.async('blob'), data.backgroundPhotoFile!) : undefined
      photos.push({
        id: data.settings.backgroundPhotoId,
        thumbnail,
        original,
        mimeType: original?.type || thumbnail.type || 'image/webp',
        fileName: `background.${extensionForMime(original?.type || thumbnail.type)}`,
        width: 0,
        height: 0,
        createdAt: Date.now(),
      })
    }
  }
  const settings: AppSettings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) }
  if (settings.backgroundPhotoId && !photos.some((photo) => photo.id === settings.backgroundPhotoId)) {
    settings.backgroundPhotoId = undefined
  }
  await replaceAllData(entries, photos, settings)
  return entries.length
}

function extensionForMime(mimeType: string): string {
  if (mimeType.includes('jpeg')) return 'jpg'
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('gif')) return 'gif'
  if (mimeType.includes('avif')) return 'avif'
  if (mimeType.includes('heic')) return 'heic'
  if (mimeType.includes('heif')) return 'heif'
  if (mimeType.includes('bmp')) return 'bmp'
  return 'webp'
}

function blobWithPathMime(blob: Blob, path: string): Blob {
  const extension = path.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
    jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  }
  const mimeType = mimeTypes[extension ?? '']
  return mimeType && blob.type !== mimeType ? blob.slice(0, blob.size, mimeType) : blob
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
