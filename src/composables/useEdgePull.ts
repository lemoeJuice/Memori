import { computed, ref } from 'vue'
import type { Ref } from 'vue'

export function useEdgePull(scroller: Readonly<Ref<HTMLElement | undefined>>, maxDistance = 152, canPullTop: () => boolean = () => true) {
  const topPull = ref(0)
  const bottomPull = ref(0)
  const activePull = ref(false)
  let edge: 'top' | 'bottom' | undefined
  let previousY = 0
  let edgeTravel = 0
  let trackingTouch = false
  const resistance = 0.42

  const stageStyle = computed(() => ({
    '--edge-pull-offset': `${topPull.value - bottomPull.value}px`,
    '--edge-pull-top': `${topPull.value}px`,
    '--edge-pull-bottom': `${bottomPull.value}px`,
  }))
  const topRevealStyle = computed(() => ({ opacity: Math.min(1, topPull.value / 92) }))
  const bottomRevealStyle = computed(() => ({ opacity: Math.min(1, bottomPull.value / 76) }))

  function clearPull() {
    edge = undefined
    edgeTravel = 0
    topPull.value = 0
    bottomPull.value = 0
    activePull.value = false
  }

  function setPull(nextEdge: 'top' | 'bottom', distance: number) {
    edge = nextEdge
    edgeTravel = Math.max(0, distance)
    activePull.value = true
    if (nextEdge === 'top') {
      topPull.value = Math.min(maxDistance, edgeTravel * resistance)
      bottomPull.value = 0
    } else {
      bottomPull.value = Math.min(maxDistance, edgeTravel * resistance)
      topPull.value = 0
    }
  }

  function onTouchStart(event: TouchEvent) {
    trackingTouch = event.touches.length === 1
    if (!trackingTouch) {
      clearPull()
      return
    }
    previousY = event.touches[0]?.clientY ?? 0
    clearPull()
  }

  function onTouchMove(event: TouchEvent) {
    if (!trackingTouch || event.touches.length !== 1) return
    const currentY = event.touches[0].clientY
    const delta = currentY - previousY
    previousY = currentY
    const element = scroller.value
    if (!element || Math.abs(delta) < 2) return

    if (edge) {
      const outward = edge === 'top' ? delta > 0 : delta < 0
      if (outward) setPull(edge, edgeTravel + Math.abs(delta))
      else clearPull()
      return
    }

    if (delta > 0 && element.scrollTop <= 0 && canPullTop()) {
      setPull('top', delta)
    } else if (delta < 0 && element.scrollTop + element.clientHeight >= element.scrollHeight - 1) {
      setPull('bottom', -delta)
    }
  }

  function release() {
    trackingTouch = false
    clearPull()
  }

  return { topPull, bottomPull, activePull, stageStyle, topRevealStyle, bottomRevealStyle, onTouchStart, onTouchMove, release }
}
