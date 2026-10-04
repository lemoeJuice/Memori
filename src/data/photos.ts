import { readExifLocation } from './location'
import * as exifr from 'exifr'
import type { AppSettings, PhotoInput } from './types'

export async function preparePhoto(file: File, settings: AppSettings): Promise<PhotoInput> {
  let bitmap: ImageBitmap | undefined
  let imageUrl: string | undefined
  try {
    let source: CanvasImageSource
    let sourceWidth: number
    let sourceHeight: number
    if (typeof createImageBitmap === 'function') {
      try { bitmap = await createImageBitmap(file) } catch { /* Fall back to an HTML image for mobile Safari/HEIC. */ }
    }
    if (bitmap) {
      source = bitmap
      sourceWidth = bitmap.width
      sourceHeight = bitmap.height
    } else {
      imageUrl = URL.createObjectURL(file)
      const image = await loadImage(imageUrl)
      source = image
      sourceWidth = image.naturalWidth
      sourceHeight = image.naturalHeight
    }
    const scale = Math.min(1, settings.maxImageDimension / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法处理这张照片')
    context.drawImage(source, 0, 0, width, height)
    const optimized = await canvasBlob(canvas, 'image/webp', settings.imageQuality / 100)
    const thumbnailCanvas = document.createElement('canvas')
    const thumbnailScale = Math.min(1, 640 / Math.max(width, height))
    thumbnailCanvas.width = Math.max(1, Math.round(width * thumbnailScale))
    thumbnailCanvas.height = Math.max(1, Math.round(height * thumbnailScale))
    const thumbnailContext = thumbnailCanvas.getContext('2d')
    if (!thumbnailContext) throw new Error('无法生成照片缩略图')
    thumbnailContext.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)
    const thumbnail = await canvasBlob(thumbnailCanvas, 'image/webp', 0.78)
    const exif = settings.readExif ? await readExifLocation(file) : undefined
    const exifTakenAt = settings.readExif ? await readExifDate(file) : undefined
    return {
      file,
      thumbnail,
      original: settings.preserveOriginal ? file.slice(0, file.size, file.type) : optimized,
      width,
      height,
      exifLocation: exif,
      exifTakenAt,
    }
  } finally {
    bitmap?.close()
    if (imageUrl) URL.revokeObjectURL(imageUrl)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('无法读取这张图片，请尝试使用 JPG 或 PNG。'))
    image.src = url
    if (typeof image.decode === 'function') {
      image.decode().then(() => resolve(image)).catch(() => { /* onerror reports unsupported image formats */ })
    }
  })
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('照片压缩失败')), type, quality))
}

async function readExifDate(file: File): Promise<number | undefined> {
  try {
    const data = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
    const date = data?.DateTimeOriginal ?? data?.CreateDate
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : undefined
  } catch {
    return undefined
  }
}
