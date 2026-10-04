<script setup lang="ts">
withDefaults(defineProps<{
  name: 'memory' | 'sparkle' | 'pin' | 'search' | 'wall' | 'map' | 'plus' | 'close' | 'heart' | 'image' | 'settings' | 'archive' | 'download' | 'arrow-up-right' | 'chevron-right' | 'database' | 'privacy'
  size?: number
}>(), { size: 18 })
</script>

<template>
  <svg class="icon-glyph" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'memory'">
      <path d="M5 15.5c2.2-4.7 4.3-7 7-7s4.8 2.3 7 7" />
      <path d="M5 18.5c2.2-3 4.3-4.5 7-4.5s4.8 1.5 7 4.5" />
      <circle cx="12" cy="6" r="1.2" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'sparkle'">
      <path d="M12 3.2 14 9l5.8 2-5.8 2-2 5.8-2-5.8-5.8-2L10 9l2-5.8Z" />
      <path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z" />
    </template>
    <template v-else-if="name === 'pin'">
      <path d="M19 10.1c0 5.1-7 11-7 11s-7-5.9-7-11a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10" r="2.25" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="10.8" cy="10.8" r="6.4" />
      <path d="m16 16 4.2 4.2" />
    </template>
    <template v-else-if="name === 'wall'">
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="5" rx="1.6" />
      <rect x="13" y="11" width="7" height="9" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
    </template>
    <template v-else-if="name === 'map'">
      <path d="m3.5 6 5.8-2 5.4 2 5.8-2v14l-5.8 2-5.4-2-5.8 2V6Z" />
      <path d="M9.3 4v14M14.7 6v14" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="m6 6 12 12M18 6 6 18" />
    </template>
    <template v-else-if="name === 'heart'">
      <path d="M20.4 8.7c0 4.3-8.4 10.2-8.4 10.2S3.6 13 3.6 8.7A4.5 4.5 0 0 1 12 6.3a4.5 4.5 0 0 1 8.4 2.4Z" />
    </template>
    <template v-else-if="name === 'image'">
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <circle cx="9" cy="9" r="1.4" />
      <path d="m5 17 4.5-4.5 3 3 2.3-2.3L20 18" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" fill="white" />
      <circle cx="9" cy="17" r="2" fill="white" />
    </template>
    <template v-else-if="name === 'archive'">
      <path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M12 3v12m-4-4 4 4 4-4" />
      <path d="M5 17v3h14v-3" />
    </template>
    <template v-else-if="name === 'arrow-up-right'">
      <path d="M7 17 17 7M8 7h9v9" />
    </template>
    <template v-else-if="name === 'chevron-right'">
      <path d="m9 5 7 7-7 7" />
    </template>
    <template v-else-if="name === 'database'">
      <ellipse cx="12" cy="5" rx="8" ry="2.5" />
      <path d="M4 5v7c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V5M4 12v7c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-7" />
    </template>
    <template v-else-if="name === 'privacy'">
      <path d="M2.7 12s3.3-5.5 9.3-5.5 9.3 5.5 9.3 5.5-3.3 5.5-9.3 5.5S2.7 12 2.7 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </template>
  </svg>
</template>
