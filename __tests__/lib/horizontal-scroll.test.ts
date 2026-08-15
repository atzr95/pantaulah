import type { WheelEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { scrollHorizontallyOnWheel } from "@/lib/ui/horizontal-scroll";

function makeWheelEvent({
  scrollLeft = 0,
  deltaX = 0,
  deltaY = 100,
} = {}) {
  const element = { clientWidth: 200, scrollWidth: 600, scrollLeft };
  const preventDefault = vi.fn();
  const event = {
    currentTarget: element,
    deltaMode: 0,
    deltaX,
    deltaY,
    preventDefault,
  } as unknown as WheelEvent<HTMLElement>;

  return { element, event, preventDefault };
}

describe("scrollHorizontallyOnWheel", () => {
  it("converts a vertical mouse wheel into horizontal movement", () => {
    const { element, event, preventDefault } = makeWheelEvent();

    scrollHorizontallyOnWheel(event);

    expect(element.scrollLeft).toBe(100);
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("leaves native horizontal trackpad movement alone", () => {
    const { element, event, preventDefault } = makeWheelEvent({
      deltaX: 100,
      deltaY: 10,
    });

    scrollHorizontallyOnWheel(event);

    expect(element.scrollLeft).toBe(0);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("does not trap vertical scrolling at the end of the strip", () => {
    const { element, event, preventDefault } = makeWheelEvent({ scrollLeft: 400 });

    scrollHorizontallyOnWheel(event);

    expect(element.scrollLeft).toBe(400);
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
