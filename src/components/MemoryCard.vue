<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getPhoto } from '../data/database'
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
const photoUrl = ref('')
const cardPhoto = computed(() => props.entry.photo?.id)
const date = computed(() => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(props.entry.createdAt))

async function loadPhoto() {
  if (photoUrl.value) URL.revokeObjectURL(photoUrl.value)
  photoUrl.value = ''
  if (!cardPhoto.value) return
  const photo = await getPhoto(cardPhoto.value)
  if (photo) photoUrl.value = URL.createObjectURL(photo.thumbnail)
}

onMounted(loadPhoto)
watch(cardPhoto, loadPhoto)
onBeforeUnmount(() => { if (photoUrl.value) URL.revokeObjectURL(photoUrl.value) })
</script>

<template>
  <article class="memory-card glass-card" :class="{ 'memory-card--expanded': expanded }">
    <button class="memory-card__body" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      <img v-if="photoUrl" class="memory-card__photo" :src="photoUrl" alt="记忆照片" loading="lazy" />
      <div v-else class="memory-card__no-photo" aria-hidden="true"><span>✳</span></div>
      <div class="memory-card__copy">
        <div class="memory-card__meta">
          <span v-if="entry.location" class="location-mark">⌖</span>
          <span v-if="entry.placeLabel" class="memory-card__place">{{ entry.placeLabel }}</span>
          <span v-else-if="entry.location" class="memory-card__place">一点生活</span>
          <span v-else class="memory-card__place">一段记忆</span>
          <span class="memory-card__time">{{ date }}</span>
        </div>
        <p v-if="entry.text" class="memory-card__text">{{ entry.text }}</p>
      </div>
      <span v-if="entry.favorite" class="favorite-mark" aria-label="已收藏">♥</span>
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
