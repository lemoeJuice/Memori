import { readExifLocation } from './location'
import type { AppSettings, PhotoInput } from './types'

export async function preparePhoto(file: File, settings: AppSettings): Promise<PhotoInput> {
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file)
    const scale = Math.min(1, settings.maxImageDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法处理这张照片')
    context.drawImage(bitmap, 0, 0, width, height)
    const original = await canvasBlob(canvas, 'image/webp', settings.imageQuality / 100)
    const thumbnailCanvas = document.createElement('canvas')
    const thumbnailScale = Math.min(1, 640 / Math.max(width, height))
    thumbnailCanvas.width = Math.max(1, Math.round(width * thumbnailScale))
    thumbnailCanvas.height = Math.max(1, Math.round(height * thumbnailScale))
    thumbnailCanvas.getContext('2d')!.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)
    const thumbnail = await canvasBlob(thumbnailCanvas, 'image/webp', 0.78)
    const exif = settings.readExif ? await readExifLocation(file) : undefined
    const exifTakenAt = settings.readExif ? await readExifDate(file) : undefined
    return {
      file,
      thumbnail,
      original: settings.preserveOriginal ? original : undefined,
      width,
      height,
      exifLocation: exif,
      exifTakenAt,
    }
  } finally {
    bitmap?.close()
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('照片压缩失败')), type, quality))
}

async function readExifDate(file: File): Promise<number | undefined> {
  try {
    const exifr = await import('exifr')
    const data = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
    const date = data?.DateTimeOriginal ?? data?.CreateDate
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : undefined
  } catch {
    return undefined
  }
}
