import type { DockMagnificationSlotRect } from "./dockMagnification.ts";

export interface DockMagnificationHitBounds {
  crossEnd: number;
  crossStart: number;
  mainEnd: number;
  mainStart: number;
}

function resolveDockMagnificationViewportBounds(
  viewportRect: DockMagnificationSlotRect,
  dockPlacement: "bottom" | "left"
): DockMagnificationHitBounds {
  return dockPlacement === "left"
    ? {
        crossEnd: viewportRect.right,
        crossStart: viewportRect.left,
        mainEnd: viewportRect.bottom,
        mainStart: viewportRect.top
      }
    : {
        crossEnd: viewportRect.bottom,
        crossStart: viewportRect.top,
        mainEnd: viewportRect.right,
        mainStart: viewportRect.left
      };
}

export function resolveDockMagnificationVisibleHitBounds({
  dockPlacement,
  hitBounds,
  viewportRect
}: {
  dockPlacement: "bottom" | "left";
  hitBounds: DockMagnificationHitBounds | null;
  viewportRect: DockMagnificationSlotRect | null;
}): DockMagnificationHitBounds | null {
  if (!hitBounds || !viewportRect) {
    return hitBounds;
  }

  const viewportBounds = resolveDockMagnificationViewportBounds(
    viewportRect,
    dockPlacement
  );
  const visibleBounds = {
    crossEnd: Math.min(hitBounds.crossEnd, viewportBounds.crossEnd),
    crossStart: Math.max(hitBounds.crossStart, viewportBounds.crossStart),
    mainEnd: Math.min(hitBounds.mainEnd, viewportBounds.mainEnd),
    mainStart: Math.max(hitBounds.mainStart, viewportBounds.mainStart)
  };

  if (
    visibleBounds.mainStart > visibleBounds.mainEnd ||
    visibleBounds.crossStart > visibleBounds.crossEnd
  ) {
    return null;
  }

  return visibleBounds;
}

export function isDockMagnificationPointInsideHitBounds({
  clientX,
  clientY,
  dockPlacement,
  hitBounds
}: {
  clientX: number;
  clientY: number;
  dockPlacement: "bottom" | "left";
  hitBounds: DockMagnificationHitBounds | null;
}): boolean {
  if (!hitBounds) {
    return false;
  }

  const mainAxis = dockPlacement === "left" ? clientY : clientX;
  const crossAxis = dockPlacement === "left" ? clientX : clientY;
  return (
    mainAxis >= hitBounds.mainStart &&
    mainAxis <= hitBounds.mainEnd &&
    crossAxis >= hitBounds.crossStart &&
    crossAxis <= hitBounds.crossEnd
  );
}
