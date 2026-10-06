import { readExifLocation } from './location'
import * as exifr from 'exifr'
import type { AppSettings, CompressionQuality, PhotoInput } from './types'

export interface PhotoDisplayArea { width: number; height: number; pixelRatio: number }

const ENCODING_QUALITY: Record<CompressionQuality, number> = { compact: .65, balanced: .82, clear: .92 }

export function thumbnailDimensions(width: number, height: number, display: PhotoDisplayArea) {
  const visibleEdge = Math.max(1, display.width, display.height) * Math.max(1, display.pixelRatio)
  const scale = Math.min(1, visibleEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export async function preparePhoto(file: File, settings: AppSettings, display: PhotoDisplayArea = {
  width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio || 1,
}): Promise<PhotoInput> {
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
    const thumbnailSize = thumbnailDimensions(sourceWidth, sourceHeight, display)
    const thumbnailCanvas = document.createElement('canvas')
    thumbnailCanvas.width = thumbnailSize.width
    thumbnailCanvas.height = thumbnailSize.height
    const thumbnailContext = thumbnailCanvas.getContext('2d')
    if (!thumbnailContext) throw new Error('无法生成照片缩略图')
    thumbnailContext.drawImage(source, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height)
    const quality = ENCODING_QUALITY[settings.compressionQuality]
    const thumbnail = await canvasBlob(thumbnailCanvas, 'image/webp', settings.compressPhotos ? quality : .82)
    let original: Blob = file.slice(0, file.size, file.type)
    if (settings.compressPhotos) {
      const canvas = document.createElement('canvas')
      canvas.width = sourceWidth
      canvas.height = sourceHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('无法处理这张照片')
      context.drawImage(source, 0, 0, sourceWidth, sourceHeight)
      const compressed = await canvasBlob(canvas, 'image/webp', quality)
      // Don't grow an already compact image just to change its format.
      if (compressed.size < file.size) original = compressed
    }
    const exif = settings.readExif ? await readExifLocation(file) : undefined
    const exifTakenAt = settings.readExif ? await readExifDate(file) : undefined
    return {
      file,
      thumbnail,
      original,
      width: sourceWidth,
      height: sourceHeight,
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
