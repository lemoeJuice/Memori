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
        copy.thumbnailFile = `photos/${photo.id}-thumb.webp`
        zip.file(copy.thumbnailFile, photo.thumbnail)
        if (photo.original) {
          copy.photoFile = `photos/${photo.id}.webp`
          zip.file(copy.photoFile, photo.original)
        }
      }
    }
    exportedEntries.push(copy)
  }
  const archive: ExportArchive = { schemaVersion: 1, exportedAt: Date.now(), entries: exportedEntries, settings }
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
    const thumbnail = await thumb.async('blob')
    const originalEntry = originalPath ? zip.file(originalPath) : null
    const original = originalEntry ? await originalEntry.async('blob') : undefined
    photos.push({
      id: entry.photo.id,
      thumbnail,
      original,
      mimeType: original?.type || thumbnail.type || 'image/webp',
      fileName: `${entry.photo.id}.webp`,
      width: 0,
      height: 0,
      createdAt: entry.createdAt,
    })
  }
  const settings: AppSettings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) }
  await replaceAllData(entries, photos, settings)
  return entries.length
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
