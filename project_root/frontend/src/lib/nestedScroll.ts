import type { WheelEvent as ReactWheelEvent } from 'react'

function scrollOverflowAncestor(from: HTMLElement, deltaY: number) {
  let node: HTMLElement | null = from.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    const canScroll = (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1
    if (canScroll) {
      node.scrollTop += deltaY
      return true
    }
    node = node.parentElement
  }
  return false
}

export function passWheelToScrollParent(event: ReactWheelEvent<HTMLElement>) {
  const el = event.currentTarget
  const deltaY = event.deltaY
  if (deltaY === 0) return

  const canScroll = el.scrollHeight > el.clientHeight + 1
  const atTop = el.scrollTop <= 0
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
  if (canScroll && ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom))) {
    return
  }

  if (scrollOverflowAncestor(el, deltaY)) {
    event.preventDefault()
  }
}
