<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getPhoto } from '../data/database'
import { readExifLocation } from '../data/location'
import { useMemoryLocation } from '../composables/useMemoryLocation'
import { preparePhoto } from '../data/photos'
import { createId } from '../data/id'
import type { AppSettings, MemoryEntry, PhotoInput, PhotoRef, StoredPhoto } from '../data/types'
import IconGlyph from './IconGlyph.vue'

const props = defineProps<{ settings: AppSettings; existing?: MemoryEntry; saving?: boolean }>()
const emit = defineEmits<{
  save: [entry: MemoryEntry, photo?: StoredPhoto]
  cancel: []
}>()

const picker = ref<HTMLInputElement>()
const composerElement = ref<HTMLElement>()
const existingPhoto = ref<PhotoRef | undefined>(props.existing?.photo ? { ...props.existing.photo } : undefined)
const photoInput = ref<PhotoInput>()
const previewUrl = ref('')
const placeLabel = ref(props.existing?.placeLabel ?? '')
const text = ref(props.existing?.text ?? '')
const {
  recordCurrentLocation, photoLocation, location, locationBusy, locationStatus,
  setRecordCurrentLocation, setPhotoLocation, start: startLocation, dispose: disposeLocation,
} = useMemoryLocation(props.existing)
const photoBusy = ref(false)
const photoError = ref('')
const displayLocationStatus = computed(() => !recordCurrentLocation.value && photoBusy.value ? '正在读取照片信息…' : locationStatus.value)
const createdAt = props.existing?.createdAt ?? Date.now()
const isSaving = computed(() => props.saving ?? false)
const formattedTime = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(createdAt))
let photoRequestToken = 0
let disposed = false

onMounted(() => {
  startLocation()
  if (existingPhoto.value) void restorePhoto()
})

async function restorePhoto() {
  const token = photoRequestToken
  photoBusy.value = true
  try {
    const stored = await getPhoto(existingPhoto.value!.id)
    if (!stored || disposed || token !== photoRequestToken) return
    previewUrl.value = URL.createObjectURL(stored.thumbnail)
    // Old entries may not have stored their photo GPS separately. Read it from
    // the original only when EXIF reading is enabled; never relocate an edit.
    if (!photoLocation.value && props.settings.readExif && stored.original) {
      const file = new File([stored.original], stored.fileName, { type: stored.original.type })
      const exif = await readExifLocation(file)
      if (!disposed && token === photoRequestToken) setPhotoLocation(exif)
    }
  } catch {
    if (!disposed && token === photoRequestToken) photoError.value = '暂时无法读取这张照片'
  } finally {
    if (!disposed && token === photoRequestToken) photoBusy.value = false
  }
}

onBeforeUnmount(() => {
  disposed = true
  photoRequestToken++
  disposeLocation()
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

async function choosePhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const token = ++photoRequestToken
  photoBusy.value = true
  photoError.value = ''
  try {
    const element = composerElement.value
    const prepared = await preparePhoto(file, props.settings, {
      width: element?.clientWidth || window.innerWidth,
      height: Math.min(element?.closest('.wall-scroller')?.clientHeight || window.innerHeight, 275),
      pixelRatio: window.devicePixelRatio || 1,
    })
    if (disposed || token !== photoRequestToken) return
    photoInput.value = prepared
    setPhotoLocation(prepared.exifLocation)
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(prepared.thumbnail)
  } catch (error) {
    if (!disposed && token === photoRequestToken) photoError.value = error instanceof Error ? error.message : '无法读取照片'
  } finally {
    if (!disposed && token === photoRequestToken) {
      photoBusy.value = false
      if (picker.value) picker.value.value = ''
    }
  }
}

function removePhoto() {
  photoRequestToken++
  photoBusy.value = false
  photoError.value = ''
  photoInput.value = undefined
  existingPhoto.value = undefined
  setPhotoLocation(undefined)
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

function save() {
  if (props.saving || photoBusy.value || locationBusy.value) return
  const id = props.existing?.id ?? createId()
  const photoId = photoInput.value ? createId() : existingPhoto.value?.id
  const entry: MemoryEntry = {
    id,
    createdAt,
    updatedAt: Date.now(),
    photo: photoId ? {
      id: photoId,
      exifTakenAt: photoInput.value ? photoInput.value.exifTakenAt : existingPhoto.value?.exifTakenAt,
      exifLocation: photoLocation.value ? { ...photoLocation.value } : undefined,
    } : undefined,
    location: location.value ? { ...location.value } : undefined,
    placeLabel: placeLabel.value.trim() || undefined,
    text: text.value.trim() || undefined,
    favorite: props.existing?.favorite ?? false,
  }
  const storedPhoto: StoredPhoto | undefined = photoInput.value ? {
    id: photoId!,
    thumbnail: photoInput.value.thumbnail,
    original: photoInput.value.original,
    mimeType: photoInput.value.original?.type ?? photoInput.value.thumbnail.type,
    fileName: photoInput.value.file.name,
    width: photoInput.value.width,
    height: photoInput.value.height,
    createdAt: Date.now(),
  } : undefined
  emit('save', entry, storedPhoto)
}
</script>

<template>
  <article ref="composerElement" class="composer-card glass-card">
    <div class="composer-topline">
      <span>{{ existing ? '编辑这段记忆' : '此刻' }}</span>
      <button class="icon-button quiet-button" type="button" aria-label="收起编辑" @click="emit('cancel')"><IconGlyph name="close" :size="15" /></button>
    </div>
    <p class="composer-time"><span>{{ formattedTime }}</span><span class="composer-location-status" role="status">{{ displayLocationStatus }}</span></p>
    <div class="composer-photo" :class="{ 'composer-photo--filled': previewUrl }">
      <img v-if="previewUrl" :src="previewUrl" alt="照片预览" />
      <button v-else class="photo-prompt" type="button" :disabled="photoBusy" @click="picker?.click()">
        <span class="photo-plus"><IconGlyph :name="photoBusy ? 'sparkle' : 'image'" :size="19" /></span>
        <span>{{ photoBusy ? '正在准备照片' : '留一张照片' }}</span>
      </button>
      <div v-if="previewUrl" class="photo-tools">
        <button type="button" @click="picker?.click()">更换</button>
        <button type="button" @click="removePhoto">移除</button>
      </div>
    </div>
    <input ref="picker" class="visually-hidden" type="file" accept="image/*" @change="choosePhoto" />
    <p v-if="photoError" class="photo-feedback" role="alert">{{ photoError }}</p>
    <label class="location-line"><span class="location-icon"><IconGlyph name="pin" :size="15" /></span><span>记录当前位置</span><input v-model="recordCurrentLocation" class="toggle-input" type="checkbox" @change="setRecordCurrentLocation(recordCurrentLocation)" /></label>
    <label class="editor-label">
      <span>地点</span>
      <input v-model="placeLabel" type="text" maxlength="100" placeholder="给这个地方起个名字 · 可选" />
    </label>
    <label class="editor-label editor-label--note">
      <span>片刻</span>
      <textarea v-model="text" maxlength="1200" rows="3" placeholder="写一点当时的心情，或者什么也不写……" />
    </label>
    <div class="composer-footer">
      <span class="optional-note">时间和地点之外，其余都可以留白</span>
      <button class="save-button" type="button" :disabled="isSaving || photoBusy || locationBusy" @click="save">{{ isSaving ? '正在保存…' : '保存记忆' }} <IconGlyph v-if="!isSaving" name="arrow-up-right" :size="13" /></button>
    </div>
  </article>
</template>
