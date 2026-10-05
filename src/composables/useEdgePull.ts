import { computed, ref } from 'vue'
import type { Ref } from 'vue'

export function useEdgePull(scroller: Readonly<Ref<HTMLElement | undefined>>, maxDistance = 152, canPullTop: () => boolean = () => true) {
  const topPull = ref(0)
  const bottomPull = ref(0)
  const activePull = ref(false)
  let edge: 'top' | 'bottom' | undefined
  let previousY = 0
  let manualScroll = false
  let edgeTravel = 0
  const resistance = 0.42

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
      manualScroll = false
      edgeTravel = 0
      activePull.value = false
      topPull.value = 0
      bottomPull.value = 0
      return
    }
    previousY = event.touches[0].clientY
    edge = undefined
    manualScroll = false
    topPull.value = 0
    bottomPull.value = 0
    activePull.value = false
  }

  function clearPull() {
    edge = undefined
    edgeTravel = 0
    topPull.value = 0
    bottomPull.value = 0
    activePull.value = manualScroll
  }

  function setPull(nextEdge: 'top' | 'bottom', distance: number) {
    edge = nextEdge
    manualScroll = true
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

  function applyManualScroll(element: HTMLElement, delta: number) {
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
    const nextScrollTop = element.scrollTop - delta
    if (nextScrollTop < 0) {
      element.scrollTop = 0
      if (canPullTop()) setPull('top', -nextScrollTop)
      else clearPull()
    } else if (nextScrollTop > maxScrollTop) {
      element.scrollTop = maxScrollTop
      setPull('bottom', nextScrollTop - maxScrollTop)
    } else {
      element.scrollTop = nextScrollTop
      clearPull()
    }
  }

  function onTouchMove(event: TouchEvent) {
    if (event.touches.length !== 1) return
    const currentY = event.touches[0].clientY
    const delta = currentY - previousY
    previousY = currentY
    const element = scroller.value
    if (!element) return

    if (edge) {
      const outward = edge === 'top' ? delta > 0 : delta < 0
      if (outward) {
        setPull(edge, edgeTravel + Math.abs(delta))
      } else {
        const distanceToRelease = edgeTravel
        const reversedDistance = Math.abs(delta)
        if (reversedDistance < distanceToRelease) {
          setPull(edge, edgeTravel - reversedDistance)
        } else {
          const remainingDistance = reversedDistance - distanceToRelease
          clearPull()
          if (remainingDistance > 0) applyManualScroll(element, Math.sign(delta) * remainingDistance)
        }
      }
      if (event.cancelable) event.preventDefault()
      return
    }

    if (manualScroll) {
      if (event.cancelable) event.preventDefault()
      applyManualScroll(element, delta)
      return
    }

    if (!edge) {
      if (Math.abs(delta) < 2) return
      const atTop = element.scrollTop <= 0
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1
      if (delta > 0 && atTop) {
        if (canPullTop()) setPull('top', Math.abs(delta))
        else {
          manualScroll = true
          activePull.value = true
          if (event.cancelable) event.preventDefault()
          return
        }
      }
      else if (delta < 0 && atBottom) setPull('bottom', Math.abs(delta))
      if (!manualScroll) return
    }

    if (event.cancelable) event.preventDefault()
  }

  function release() {
    manualScroll = false
    clearPull()
  }

  return { topPull, bottomPull, activePull, stageStyle, topRevealStyle, bottomRevealStyle, onTouchStart, onTouchMove, release }
}
