import { onBeforeUnmount, onMounted } from 'vue'
import type { Ref } from 'vue'

const EDGE_HEIGHT = 152
const RETURN_DURATION = 380

type Edge = 'top' | 'bottom'

/** Only the edge gesture paints; ordinary scrolling stays entirely native. */
export function attachEdgePull(stage: HTMLElement, scroller: HTMLElement, canPullTop: () => boolean = () => true) {
  const topPanel = stage.querySelector<HTMLElement>('[data-edge-reveal="top"]')
  const bottomPanel = stage.querySelector<HTMLElement>('[data-edge-reveal="bottom"]')
  let edge: Edge | undefined
  let travel = 0
  let previousY = 0
  let previousX = 0
  let tracking = false
  let paintedDistance = 0
  let frame = 0
  let returnTimer = 0

  function atEdge(candidate: Edge) {
    if (candidate === 'top') return canPullTop() && scroller.scrollTop <= 1
    return scroller.scrollTop >= Math.max(0, scroller.scrollHeight - scroller.clientHeight) - 1
  }

  function clearVisuals() {
    window.clearTimeout(returnTimer)
    returnTimer = 0
    stage.classList.remove('is-edge-pulling', 'is-edge-displaced')
    scroller.style.removeProperty('transform')
    for (const panel of [topPanel, bottomPanel]) {
      panel?.style.removeProperty('transform')
      panel?.style.removeProperty('opacity')
    }
    paintedDistance = 0
  }

  function resetPull() {
    window.cancelAnimationFrame(frame)
    frame = 0
    edge = undefined
    travel = 0
    if (!paintedDistance) return

    // Keep the transformed layer until its return transition has finished.
    stage.classList.remove('is-edge-pulling')
    scroller.style.transform = 'translate3d(0, 0, 0)'
    if (topPanel) {
      topPanel.style.transform = `translate3d(0, -${EDGE_HEIGHT}px, 0)`
      topPanel.style.opacity = '0'
    }
    if (bottomPanel) {
      bottomPanel.style.transform = `translate3d(0, ${EDGE_HEIGHT}px, 0)`
      bottomPanel.style.opacity = '0'
    }
    window.clearTimeout(returnTimer)
    returnTimer = window.setTimeout(clearVisuals, RETURN_DURATION)
    paintedDistance = 0
  }

  function paint() {
    frame = 0
    if (!edge || !atEdge(edge)) {
      resetPull()
      return
    }
    window.clearTimeout(returnTimer)
    returnTimer = 0
    // Bounded damping: reverse gestures don't have to undo unlimited travel.
    const distance = EDGE_HEIGHT * (1 - Math.exp(-travel / 220))
    const offset = edge === 'top' ? distance : -distance
    stage.classList.add('is-edge-displaced', 'is-edge-pulling')
    scroller.style.transform = `translate3d(0, ${offset}px, 0)`
    if (topPanel) {
      const pull = edge === 'top' ? distance : 0
      topPanel.style.transform = `translate3d(0, ${pull - EDGE_HEIGHT}px, 0)`
      topPanel.style.opacity = String(Math.min(1, pull / 80))
    }
    if (bottomPanel) {
      const pull = edge === 'bottom' ? distance : 0
      bottomPanel.style.transform = `translate3d(0, ${EDGE_HEIGHT - pull}px, 0)`
      bottomPanel.style.opacity = String(Math.min(1, pull / 64))
    }
    paintedDistance = distance
  }

  function release() {
    tracking = false
    resetPull()
  }

  function onTouchStart(event: TouchEvent) {
    resetPull()
    const target = event.target
    // Range controls and text fields keep their own gestures.
    tracking = event.touches.length === 1 && !(target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]'))
    if (!tracking) return
    previousY = event.touches[0].clientY
    previousX = event.touches[0].clientX
  }

  function onTouchMove(event: TouchEvent) {
    if (event.touches.length !== 1) {
      release()
      return
    }
    if (!tracking) return
    const touch = event.touches[0]
    const delta = touch.clientY - previousY
    const deltaX = touch.clientX - previousX
    previousY = touch.clientY
    previousX = touch.clientX
    if (!delta || Math.abs(deltaX) > Math.abs(delta)) return

    if (edge && !atEdge(edge)) resetPull()
    const candidate: Edge = delta > 0 ? 'top' : 'bottom'
    if (!edge) {
      if (!atEdge(candidate)) return
      edge = candidate
    }
    travel = Math.max(0, Math.min(880, travel + (edge === 'top' ? delta : -delta)))
    if (!travel) {
      resetPull()
      return
    }
    if (!frame) frame = window.requestAnimationFrame(paint)
  }

  function onScroll() {
    if (edge && !atEdge(edge)) resetPull()
  }

  // No preventDefault or scrollTop writes: native scrolling and inertia remain.
  scroller.addEventListener('touchstart', onTouchStart, { passive: true })
  scroller.addEventListener('touchmove', onTouchMove, { passive: true })
  scroller.addEventListener('touchend', release, { passive: true })
  scroller.addEventListener('touchcancel', release, { passive: true })
  scroller.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('blur', release)
  window.addEventListener('resize', release)
  document.addEventListener('visibilitychange', release)

  return {
    release,
    destroy() {
      scroller.removeEventListener('touchstart', onTouchStart)
      scroller.removeEventListener('touchmove', onTouchMove)
      scroller.removeEventListener('touchend', release)
      scroller.removeEventListener('touchcancel', release)
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('blur', release)
      window.removeEventListener('resize', release)
      document.removeEventListener('visibilitychange', release)
      window.cancelAnimationFrame(frame)
      clearVisuals()
    },
  }
}

export function useEdgePull(stage: Readonly<Ref<HTMLElement | undefined>>, scroller: Readonly<Ref<HTMLElement | undefined>>, canPullTop: () => boolean = () => true) {
  let controller: ReturnType<typeof attachEdgePull> | undefined
  onMounted(() => {
    if (stage.value && scroller.value) controller = attachEdgePull(stage.value, scroller.value, canPullTop)
  })
  onBeforeUnmount(() => controller?.destroy())
  return { release: () => controller?.release() }
}
