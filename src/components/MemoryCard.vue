<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getPhoto } from '../data/database'
import IconGlyph from './IconGlyph.vue'
import type { MemoryEntry } from '../data/types'

const props = defineProps<{ entry: MemoryEntry; isEditing?: boolean }>()
const emit = defineEmits<{
  edit: [entry: MemoryEntry]
  remove: [id: string]
  favorite: [entry: MemoryEntry]
  share: [entry: MemoryEntry]
}>()

const expanded = ref(false)
const confirmDelete = ref(false)
const cardElement = ref<HTMLElement>()
const photoUrl = ref('')
const cardPhoto = computed(() => props.entry.photo?.id)
const date = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(props.entry.createdAt))
let photoObserver: IntersectionObserver | undefined
let disposed = false

function observePhoto() {
  photoObserver?.disconnect()
  photoObserver = undefined
  const photoId = cardPhoto.value
  if (!photoId || !cardElement.value) return
  if (!('IntersectionObserver' in window)) {
    void loadPhoto(photoId)
    return
  }
  photoObserver = new IntersectionObserver((items) => {
    if (!items.some((item) => item.isIntersecting)) return
    photoObserver?.disconnect()
    photoObserver = undefined
    void loadPhoto(photoId)
  }, { root: cardElement.value.closest('.wall-scroller'), rootMargin: '280px 0px' })
  photoObserver.observe(cardElement.value)
}

async function loadPhoto(photoId: string) {
  const photo = await getPhoto(photoId)
  if (!photo || disposed || cardPhoto.value !== photoId) return
  const nextUrl = URL.createObjectURL(photo.thumbnail)
  const previousUrl = photoUrl.value
  photoUrl.value = nextUrl
  if (previousUrl) URL.revokeObjectURL(previousUrl)
}

onMounted(observePhoto)
watch(cardPhoto, () => {
  photoObserver?.disconnect()
  photoObserver = undefined
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
  photoUrl.value = ''
  observePhoto()
})
onBeforeUnmount(() => {
  disposed = true
  photoObserver?.disconnect()
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
})
</script>

<template>
  <article ref="cardElement" class="memory-card glass-card" :class="{ 'memory-card--expanded': expanded }">
    <button class="memory-card__body" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <img v-if="photoUrl" class="memory-card__photo" :src="photoUrl" alt="记忆照片" loading="lazy" />
      <div v-else class="memory-card__no-photo" aria-hidden="true"><span><IconGlyph name="sparkle" :size="18" /></span></div>
      <div class="memory-card__copy">
        <div class="memory-card__meta">
          <span v-if="entry.location" class="location-mark"><IconGlyph name="pin" :size="13" /></span>
          <span v-if="entry.placeLabel" class="memory-card__place">{{ entry.placeLabel }}</span>
          <span v-else-if="entry.location" class="memory-card__place">一点生活</span>
          <span v-else class="memory-card__place">一段记忆</span>
          <span class="memory-card__time">{{ date }}</span>
        </div>
        <p v-if="entry.text" class="memory-card__text">{{ entry.text }}</p>
      </div>
      <span v-if="entry.favorite" class="favorite-mark" aria-label="已收藏"><IconGlyph name="heart" :size="13" /></span>
    </button>
    <div v-if="expanded" class="memory-card__actions" @click.stop>
      <template v-if="!confirmDelete">
        <button type="button" @click="emit('edit', entry)">编辑</button>
        <button type="button" @click="emit('favorite', entry)">{{ entry.favorite ? '取消收藏' : '收藏' }}</button>
        <button type="button" @click="emit('share', entry)">导出回忆卡片</button>
        <button class="action-danger" type="button" @click="confirmDelete = true">删除</button>
      </template>
      <template v-else>
        <span>确定移除这段记忆？</span>
        <button class="action-danger" type="button" @click="emit('remove', entry.id)">确认删除</button>
        <button type="button" @click="confirmDelete = false">保留</button>
      </template>
    </div>
  </article>
</template>
