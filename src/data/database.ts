import type { AppSettings, MemoryEntry, StoredPhoto } from './types'
import { DEFAULT_SETTINGS } from './types'

const DATABASE_NAME = 'memori-local'
const DATABASE_VERSION = 1
const ENTRY_STORE = 'entries'
const PHOTO_STORE = 'photos'
const SETTINGS_STORE = 'settings'

let databasePromise: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('当前环境不支持本地 IndexedDB 存储。'))
  }
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      const entries = database.objectStoreNames.contains(ENTRY_STORE)
        ? request.transaction!.objectStore(ENTRY_STORE)
        : database.createObjectStore(ENTRY_STORE, { keyPath: 'id' })
      if (!entries.indexNames.contains('createdAt')) entries.createIndex('createdAt', 'createdAt')
      if (!database.objectStoreNames.contains(PHOTO_STORE)) database.createObjectStore(PHOTO_STORE, { keyPath: 'id' })
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) database.createObjectStore(SETTINGS_STORE)
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = undefined
      }
      resolve(database)
    }
    request.onerror = () => {
      databasePromise = undefined
      reject(request.error ?? new Error('无法打开本地数据库。'))
    }
    request.onblocked = () => reject(new Error('本地数据库正在被其他页面占用，请关闭其他标签页后重试。'))
  })
  return databasePromise
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('本地数据库操作失败。'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('本地数据库事务失败。'))
  })
}

export async function getEntriesPage(before?: number, limit = 40): Promise<MemoryEntry[]> {
  const db = await openDatabase()
  const tx = db.transaction(ENTRY_STORE, 'readonly')
  const store = tx.objectStore(ENTRY_STORE)
  const range = before === undefined ? undefined : IDBKeyRange.upperBound(before, true)
  const rows: MemoryEntry[] = []
  await new Promise<void>((resolve, reject) => {
    const cursor = store.index('createdAt').openCursor(range, 'prev')
    cursor.onerror = () => reject(cursor.error)
    cursor.onsuccess = () => {
      const item = cursor.result
      if (!item || rows.length >= limit) return resolve()
      rows.push(item.value as MemoryEntry)
      item.continue()
    }
  })
  return rows.reverse()
}

export async function getAllEntries(): Promise<MemoryEntry[]> {
  const db = await openDatabase()
  const rows = await requestResult(db.transaction(ENTRY_STORE, 'readonly').objectStore(ENTRY_STORE).getAll()) as MemoryEntry[]
  return rows.sort((a, b) => a.createdAt - b.createdAt)
}

export async function getEntry(id: string): Promise<MemoryEntry | undefined> {
  const db = await openDatabase()
  return requestResult(db.transaction(ENTRY_STORE, 'readonly').objectStore(ENTRY_STORE).get(id)) as Promise<MemoryEntry | undefined>
}

export async function saveMemory(entry: MemoryEntry, photo?: StoredPhoto): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction([ENTRY_STORE, PHOTO_STORE], 'readwrite')
  const entries = tx.objectStore(ENTRY_STORE)
  const photos = tx.objectStore(PHOTO_STORE)
  const previous = await requestResult(entries.get(entry.id)) as MemoryEntry | undefined
  if (photo) photos.put(photo)
  entries.put(entry)
  if (previous?.photo && previous.photo.id !== entry.photo?.id) {
    const all = await requestResult(entries.getAll()) as MemoryEntry[]
    if (!all.some((item) => item.id !== entry.id && item.photo?.id === previous.photo?.id)) photos.delete(previous.photo.id)
  }
  await transactionDone(tx)
}

export async function deleteMemory(id: string): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction([ENTRY_STORE, PHOTO_STORE], 'readwrite')
  const entries = tx.objectStore(ENTRY_STORE)
  const photos = tx.objectStore(PHOTO_STORE)
  const target = await requestResult(entries.get(id)) as MemoryEntry | undefined
  entries.delete(id)
  if (target?.photo?.id) {
    const all = await requestResult(entries.getAll()) as MemoryEntry[]
    if (!all.some((entry) => entry.photo?.id === target.photo?.id)) photos.delete(target.photo.id)
  }
  await transactionDone(tx)
}

export async function getPhoto(id: string): Promise<StoredPhoto | undefined> {
  const db = await openDatabase()
  return requestResult(db.transaction(PHOTO_STORE, 'readonly').objectStore(PHOTO_STORE).get(id)) as Promise<StoredPhoto | undefined>
}

export async function getSettings(): Promise<AppSettings> {
  const db = await openDatabase()
  const tx = db.transaction(SETTINGS_STORE, 'readonly')
  const saved = await requestResult(tx.objectStore(SETTINGS_STORE).get('app')) as Partial<AppSettings> | undefined
  return { ...DEFAULT_SETTINGS, ...saved }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction(SETTINGS_STORE, 'readwrite')
  tx.objectStore(SETTINGS_STORE).put(settings, 'app')
  await transactionDone(tx)
}

export async function replaceAllData(entries: MemoryEntry[], photos: StoredPhoto[], settings: AppSettings): Promise<void> {
  const db = await openDatabase()
  const tx = db.transaction([ENTRY_STORE, PHOTO_STORE, SETTINGS_STORE], 'readwrite')
  const entryStore = tx.objectStore(ENTRY_STORE)
  const photoStore = tx.objectStore(PHOTO_STORE)
  entryStore.clear()
  photoStore.clear()
  entries.forEach((entry) => entryStore.put(entry))
  photos.forEach((photo) => photoStore.put(photo))
  tx.objectStore(SETTINGS_STORE).put(settings, 'app')
  await transactionDone(tx)
}

export async function estimateStorage(): Promise<{ usage?: number; quota?: number }> {
  if (!navigator.storage?.estimate) return {}
  const { usage, quota } = await navigator.storage.estimate()
  return { usage, quota }
}
