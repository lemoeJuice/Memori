import { computed, ref } from 'vue'
import type { Ref } from 'vue'

export function useEdgePull(scroller: Readonly<Ref<HTMLElement | undefined>>, maxDistance = 152, canPullTop: () => boolean = () => true) {
  const topPull = ref(0)
  const bottomPull = ref(0)
  const activePull = ref(false)
  let edge: 'top' | 'bottom' | undefined
  let previousY = 0
  let pullOriginY = 0
  let gestureEligible = true

  const stageStyle = computed(() => ({
    '--edge-pull-offset': `${topPull.value - bottomPull.value}px`,
    '--edge-pull-top': `${topPull.value}px`,
    '--edge-pull-bottom': `${bottomPull.value}px`,
  }))
  const topRevealStyle = computed(() => ({
    opacity: Math.min(1, topPull.value / 92),
  }))
  const bottomRevealStyle = computed(() => ({
    opacity: Math.min(1, bottomPull.value / 76),
  }))

  function onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) {
      edge = undefined
      activePull.value = false
      topPull.value = 0
      bottomPull.value = 0
      return
    }
    previousY = event.touches[0].clientY
    const target = event.target
    gestureEligible = !(target instanceof Element && target.closest('button, input, textarea, select, a, [contenteditable="true"]'))
    edge = undefined
    topPull.value = 0
    bottomPull.value = 0
    activePull.value = false
  }

  function onTouchMove(event: TouchEvent) {
    if (event.touches.length !== 1) return
    const currentY = event.touches[0].clientY
    const delta = currentY - previousY
    previousY = currentY
    const element = scroller.value
    if (!element) return

    if (!edge) {
      if (!gestureEligible) return
      if (Math.abs(delta) < 2) return
      const atTop = element.scrollTop <= 0
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1
      if (delta > 0 && atTop) {
        if (canPullTop()) edge = 'top'
        else {
          if (event.cancelable) event.preventDefault()
          return
        }
      }
      else if (delta < 0 && atBottom) edge = 'bottom'
      if (!edge) return
      pullOriginY = currentY - delta
      activePull.value = true
    }

    if (event.cancelable) event.preventDefault()
    const distance = edge === 'top' ? currentY - pullOriginY : pullOriginY - currentY
    const resistedDistance = Math.min(maxDistance, Math.max(0, distance) * 0.42)
    if (edge === 'top') topPull.value = resistedDistance
    else bottomPull.value = resistedDistance
  }

  function release() {
    edge = undefined
    activePull.value = false
    topPull.value = 0
    bottomPull.value = 0
  }

  return { topPull, bottomPull, activePull, stageStyle, topRevealStyle, bottomRevealStyle, onTouchStart, onTouchMove, release }
}
