<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getPhoto } from '../data/database'
import { getCurrentLocation } from '../data/location'
import { preparePhoto } from '../data/photos'
import { createId } from '../data/id'
import type { AppSettings, GeoPoint, MemoryEntry, PhotoInput, StoredPhoto } from '../data/types'
import IconGlyph from './IconGlyph.vue'

const props = defineProps<{ settings: AppSettings; existing?: MemoryEntry; saving?: boolean }>()
const emit = defineEmits<{
  save: [entry: MemoryEntry, photo?: StoredPhoto]
  cancel: []
}>()

const picker = ref<HTMLInputElement>()
const photoInput = ref<PhotoInput>()
const previewUrl = ref('')
const placeLabel = ref(props.existing?.placeLabel ?? '')
const text = ref(props.existing?.text ?? '')
const location = ref<GeoPoint | undefined>(props.existing?.location)
const locationStatus = ref(props.existing?.location ? '已记录位置' : '定位中…')
const photoBusy = ref(false)
const createdAt = props.existing?.createdAt ?? Date.now()
const isSaving = computed(() => props.saving ?? false)
const formattedTime = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(createdAt))
let locationRequestToken = 0

onMounted(async () => {
  if (props.existing?.photo) {
    const stored = await getPhoto(props.existing.photo.id)
    if (stored) previewUrl.value = URL.createObjectURL(stored.thumbnail)
  }
  const hasExistingPhoto = Boolean(props.existing?.photo)
  const allowCurrentLocation = !hasExistingPhoto || props.settings.currentLocationFallback
  if (!location.value && props.settings.locationEnabled && allowCurrentLocation) {
    await requestCurrentLocation()
  } else if (!location.value && props.settings.locationEnabled) {
    locationStatus.value = '未记录位置'
  } else if (!props.settings.locationEnabled) {
    locationStatus.value = '位置记录已关闭'
  }
})

onBeforeUnmount(() => { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value) })

async function choosePhoto(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  photoBusy.value = true
  const requestToken = ++locationRequestToken
  if (location.value?.source === 'current') location.value = undefined
  locationStatus.value = props.settings.locationEnabled ? '正在读取照片位置…' : '位置记录已关闭'
  try {
    const prepared = await preparePhoto(file, props.settings)
    photoInput.value = prepared
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(prepared.thumbnail)
    if (props.settings.locationEnabled && props.settings.preferExifLocation && prepared.exifLocation) {
      location.value = { ...prepared.exifLocation, source: 'exif' }
      locationStatus.value = '已使用照片拍摄位置'
    } else if (props.settings.locationEnabled && props.settings.currentLocationFallback) {
      await requestCurrentLocation(requestToken)
    } else if (props.settings.locationEnabled) {
      location.value = undefined
      locationStatus.value = '未记录位置'
    }
  } catch (error) {
    locationStatus.value = error instanceof Error ? error.message : '无法读取照片'
  } finally {
    photoBusy.value = false
    if (picker.value) picker.value.value = ''
  }
}

function removePhoto() {
  photoInput.value = undefined
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  if (location.value?.source === 'exif') location.value = undefined
  if (!location.value && props.settings.locationEnabled) void requestCurrentLocation()
}

async function requestCurrentLocation(token = ++locationRequestToken) {
  if (!props.settings.locationEnabled) return
  locationStatus.value = '正在定位…'
  try {
    const current = await getCurrentLocation()
    if (token !== locationRequestToken || location.value?.source === 'exif') return
    location.value = current
    locationStatus.value = '已记录当前位置'
  } catch {
    if (token === locationRequestToken && location.value?.source !== 'exif') {
      locationStatus.value = '未记录位置'
    }
  }
}

function save() {
  if (props.saving || photoBusy.value) return
  const id = props.existing?.id ?? createId()
  const photoId = photoInput.value ? createId() : (props.existing?.photo && previewUrl.value ? props.existing.photo.id : undefined)
  const entry: MemoryEntry = {
    id,
    createdAt,
    updatedAt: Date.now(),
    photo: photoId ? { id: photoId, exifTakenAt: photoInput.value?.exifTakenAt ?? props.existing?.photo?.exifTakenAt } : undefined,
    location: location.value,
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
  <article class="composer-card glass-card">
    <div class="composer-topline">
      <span>{{ existing ? '编辑这段记忆' : '此刻' }}</span>
      <button class="icon-button quiet-button" type="button" aria-label="收起编辑" @click="emit('cancel')"><IconGlyph name="close" :size="15" /></button>
    </div>
    <p class="composer-time">{{ formattedTime }}</p>
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
    <div class="location-line"><span class="location-icon"><IconGlyph name="pin" :size="15" /></span><span>{{ locationStatus }}</span><span v-if="location?.source === 'exif'" class="source-note">来自照片</span></div>
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
      <button class="save-button" type="button" :disabled="isSaving || photoBusy" @click="save">{{ isSaving ? '正在保存…' : '保存记忆' }} <IconGlyph v-if="!isSaving" name="arrow-up-right" :size="13" /></button>
    </div>
  </article>
</template>
