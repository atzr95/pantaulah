import type { WheelEvent } from "react";

/** Let a standard mouse wheel move an overflowing horizontal strip. */
export function scrollHorizontallyOnWheel(event: WheelEvent<HTMLElement>) {
  const element = event.currentTarget;

  if (
    element.scrollWidth <= element.clientWidth ||
    Math.abs(event.deltaX) >= Math.abs(event.deltaY)
  ) {
    return;
  }

  const scale = event.deltaMode === 1
    ? 16
    : event.deltaMode === 2
      ? element.clientWidth
      : 1;
  const previous = element.scrollLeft;
  const maximum = element.scrollWidth - element.clientWidth;
  element.scrollLeft = Math.max(
    0,
    Math.min(maximum, previous + event.deltaY * scale),
  );

  if (element.scrollLeft !== previous) event.preventDefault();
}
