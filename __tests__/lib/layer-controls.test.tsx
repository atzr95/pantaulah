import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LayerControls, { DEFAULT_LAYERS } from "@/components/live/layer-controls";

afterEach(cleanup);

it("replaces layers for each quick view, clears all, and restores the starting choice", () => {
  const onChange = vi.fn();
  const { rerender } = render(<LayerControls layers={DEFAULT_LAYERS} onChange={onChange} />);
  for (const [label, keys] of [
    ["WEATHER", ["radar", "cloud", "wind", "smog", "terminator"]],
    ["TRAVEL", ["flights", "transit", "rail", "cctv", "buildings"]],
    ["ENVIRONMENT", ["rivers", "shelters", "fires", "smog", "wind", "quakes"]],
    ["CLEAR", []],
    ["RESET", Object.keys(DEFAULT_LAYERS).filter((key) => DEFAULT_LAYERS[key as keyof typeof DEFAULT_LAYERS])],
  ] as const) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    const next = onChange.mock.lastCall![0];
    expect(Object.keys(next).sort()).toEqual(Object.keys(DEFAULT_LAYERS).sort());
    expect(Object.keys(next).filter((key) => next[key]).sort()).toEqual([...keys].sort());
    rerender(<LayerControls layers={next} onChange={onChange} />);
    expect(screen.getByRole("button", { name: `LAYERS (${keys.length} ON)` })).toBeTruthy();
    if (["WEATHER", "TRAVEL", "ENVIRONMENT"].includes(label)) {
      expect(screen.getByRole("button", { name: label }).getAttribute("aria-pressed")).toBe("true");
    }
  }
  expect(DEFAULT_LAYERS.radar).toBe(true);
  expect(DEFAULT_LAYERS.rivers).toBe(false);
});
