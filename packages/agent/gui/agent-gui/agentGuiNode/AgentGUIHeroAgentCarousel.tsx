import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { AgentGUIProvider, AgentGUIProviderTarget } from "../../types";
import { normalizeManagedAgentProvider } from "../../shared/managedAgentProviders";
import { AgentGuiHeroCarouselScene } from "./agentGuiHeroCarouselScene";
import styles from "./AgentGUINode.styles";

export interface AgentGUIHeroCarouselIcon {
  iconUrl: string;
  provider: string;
}

export interface AgentGUIHeroCarouselSelectInput {
  provider: AgentGUIProvider;
  providerTargetId?: string | null;
}

interface AgentGUIHeroAgentCarouselProps {
  activeProvider?: string;
  icons: readonly AgentGUIHeroCarouselIcon[];
  providerTargets?: readonly AgentGUIProviderTarget[];
  onProviderSelect?: (input: AgentGUIHeroCarouselSelectInput) => void;
  providerSelectLabel?: string;
}

export function agentGUILaunchpadProviderTarget(
  providerTargets: readonly AgentGUIProviderTarget[],
  provider: string
): AgentGUIProviderTarget | null {
  const normalized = normalizeManagedAgentProvider(provider);
  const matches = providerTargets.filter(
    (target) => normalizeManagedAgentProvider(target.provider) === normalized
  );
  // Prefer a ready target, but fall back to a disabled placeholder so
  // unavailable agents stay selectable from the ring — selecting one surfaces
  // its coming-soon / readiness gate while the carousel keeps spinning.
  return (
    matches.find((target) => target.disabled !== true) ?? matches[0] ?? null
  );
}

const CAROUSEL_WHEEL_STEP_THRESHOLD = 42;
const CAROUSEL_WHEEL_STEP_COOLDOWN_MS = 110;
const CAROUSEL_DRAG_STEP_PX = 52;

// Empty-hero agent switcher for the "All" tab: a ring of same-sized agent
// tiles rendered with three.js (see agentGuiHeroCarouselScene) so tiles
// farther around the ring genuinely shrink and fade with perspective.
// Wheel, drag, and arrow keys spin the ring; the centered agent commits once
// the spin settles; clicking a tile (canvas raycast or the visually-hidden
// accessible buttons) selects it immediately.
export const AgentGUIHeroAgentCarousel = memo(
  function AgentGUIHeroAgentCarousel({
    activeProvider,
    icons,
    providerTargets,
    onProviderSelect,
    providerSelectLabel
  }: AgentGUIHeroAgentCarouselProps): React.JSX.Element {
    const normalizedActiveProvider = activeProvider
      ? normalizeManagedAgentProvider(activeProvider)
      : null;
    const activeIconIndex = useMemo(
      () =>
        normalizedActiveProvider === null
          ? -1
          : icons.findIndex(
              (icon) =>
                normalizeManagedAgentProvider(icon.provider) ===
                normalizedActiveProvider
            ),
      [icons, normalizedActiveProvider]
    );
    const [centerIndex, setCenterIndex] = useState(
      activeIconIndex >= 0 ? activeIconIndex : 0
    );
    const centerIndexRef = useRef(centerIndex);
    centerIndexRef.current = centerIndex;
    const activeIconIndexRef = useRef(activeIconIndex);
    activeIconIndexRef.current = activeIconIndex;
    const interactive =
      onProviderSelect != null && (providerTargets?.length ?? 0) > 0;

    const targetForIndex = useCallback(
      (index: number): AgentGUIProviderTarget | null => {
        const icon = icons[index];
        if (!icon || !interactive) {
          return null;
        }
        return agentGUILaunchpadProviderTarget(
          providerTargets ?? [],
          icon.provider
        );
      },
      [icons, interactive, providerTargets]
    );

    const selectIndex = useCallback(
      (index: number) => {
        const target = targetForIndex(index);
        if (!target || !onProviderSelect) {
          return;
        }
        onProviderSelect({
          provider: target.provider,
          providerTargetId: target.targetId
        });
      },
      [onProviderSelect, targetForIndex]
    );
    const selectIndexRef = useRef(selectIndex);
    selectIndexRef.current = selectIndex;

    const stageRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const sceneRef = useRef<AgentGuiHeroCarouselScene | null>(null);
    const iconKey = icons
      .map((icon) => `${icon.provider}:${icon.iconUrl}`)
      .join("|");

    useEffect(() => {
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!canvas || !stage) {
        return;
      }
      const scene = AgentGuiHeroCarouselScene.create({
        canvas,
        iconUrls: icons.map((icon) => icon.iconUrl),
        onSettle: (index) => {
          centerIndexRef.current = index;
          setCenterIndex(index);
          // The ring can settle on the already-active agent (external syncs,
          // re-centering); only user-driven landings commit a switch.
          if (index !== activeIconIndexRef.current) {
            selectIndexRef.current(index);
          }
        }
      });
      sceneRef.current = scene;
      if (!scene) {
        return;
      }
      scene.moveTo(centerIndexRef.current, false);
      const resize = (): void => {
        const rect = stage.getBoundingClientRect();
        scene.setSize(rect.width, rect.height);
      };
      resize();
      const observer =
        typeof ResizeObserver === "function"
          ? new ResizeObserver(resize)
          : null;
      observer?.observe(stage);
      return () => {
        observer?.disconnect();
        scene.dispose();
        sceneRef.current = null;
      };
      // The scene is rebuilt only when the icon set itself changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [iconKey]);

    // Follow external agent switches (left rail, hero title dropdown).
    useEffect(() => {
      if (activeIconIndex >= 0 && activeIconIndex !== centerIndexRef.current) {
        centerIndexRef.current = activeIconIndex;
        setCenterIndex(activeIconIndex);
        sceneRef.current?.moveTo(activeIconIndex);
      }
    }, [activeIconIndex]);

    const stepBy = useCallback(
      (direction: 1 | -1) => {
        const scene = sceneRef.current;
        if (!scene || icons.length <= 1) {
          return;
        }
        const next = scene.stepBy(direction);
        centerIndexRef.current = next;
        setCenterIndex(next);
      },
      [icons.length]
    );
    const stepByRef = useRef(stepBy);
    stepByRef.current = stepBy;

    // Wheel needs a non-passive listener to consume horizontal trackpad pans
    // (and vertical wheel ticks) instead of scrolling any ancestor.
    useEffect(() => {
      const stage = stageRef.current;
      if (!stage || !interactive) {
        return;
      }
      let accumulated = 0;
      let lastStepAt = 0;
      const handleWheel = (event: WheelEvent): void => {
        const delta =
          Math.abs(event.deltaX) >= Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;
        if (delta === 0) {
          return;
        }
        event.preventDefault();
        if (Math.sign(delta) !== Math.sign(accumulated)) {
          accumulated = 0;
        }
        accumulated += delta;
        const now = performance.now();
        if (
          Math.abs(accumulated) < CAROUSEL_WHEEL_STEP_THRESHOLD ||
          now - lastStepAt < CAROUSEL_WHEEL_STEP_COOLDOWN_MS
        ) {
          return;
        }
        stepByRef.current(accumulated > 0 ? 1 : -1);
        accumulated = 0;
        lastStepAt = now;
      };
      stage.addEventListener("wheel", handleWheel, { passive: false });
      return () => stage.removeEventListener("wheel", handleWheel);
    }, [interactive]);

    const dragStateRef = useRef<{ pointerId: number; anchorX: number } | null>(
      null
    );
    const suppressClickRef = useRef(false);
    const handlePointerDown = (
      event: ReactPointerEvent<HTMLDivElement>
    ): void => {
      if (!interactive || event.button !== 0) {
        return;
      }
      dragStateRef.current = {
        pointerId: event.pointerId,
        anchorX: event.clientX
      };
      suppressClickRef.current = false;
    };
    const handlePointerMove = (
      event: ReactPointerEvent<HTMLDivElement>
    ): void => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - drag.anchorX;
      if (Math.abs(deltaX) < CAROUSEL_DRAG_STEP_PX) {
        return;
      }
      drag.anchorX = event.clientX;
      suppressClickRef.current = true;
      // Dragging left pulls the next agent (to the right) into the center.
      stepBy(deltaX < 0 ? 1 : -1);
    };
    const handlePointerEnd = (
      event: ReactPointerEvent<HTMLDivElement>
    ): void => {
      if (dragStateRef.current?.pointerId === event.pointerId) {
        dragStateRef.current = null;
      }
    };
    const handleClickCapture = (event: ReactMouseEvent): void => {
      if (!suppressClickRef.current) {
        return;
      }
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      stepBy(event.key === "ArrowRight" ? 1 : -1);
    };

    const handleItemClick = (index: number): void => {
      centerIndexRef.current = index;
      setCenterIndex(index);
      sceneRef.current?.moveTo(index);
      selectIndex(index);
    };

    const pickAt = (
      event:
        | ReactMouseEvent<HTMLCanvasElement>
        | ReactPointerEvent<HTMLCanvasElement>
    ): number | null => {
      const scene = sceneRef.current;
      const canvas = canvasRef.current;
      if (!scene || !canvas || !interactive) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      return scene.pick(
        event.clientX - rect.left,
        event.clientY - rect.top,
        rect.width,
        rect.height
      );
    };

    const handleCanvasClick = (
      event: ReactMouseEvent<HTMLCanvasElement>
    ): void => {
      const index = pickAt(event);
      if (index !== null) {
        handleItemClick(index);
      }
    };

    const handleCanvasHover = (
      event: ReactPointerEvent<HTMLCanvasElement>
    ): void => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      canvas.style.cursor = pickAt(event) !== null ? "pointer" : "";
    };

    return (
      <div
        ref={stageRef}
        aria-hidden={interactive ? undefined : "true"}
        aria-label={interactive ? providerSelectLabel : undefined}
        role={interactive ? "group" : undefined}
        className={styles.emptyHeroCarousel}
        onKeyDown={interactive ? handleKeyDown : undefined}
        onPointerDown={interactive ? handlePointerDown : undefined}
        onPointerMove={interactive ? handlePointerMove : undefined}
        onPointerUp={interactive ? handlePointerEnd : undefined}
        onPointerCancel={interactive ? handlePointerEnd : undefined}
        onClickCapture={interactive ? handleClickCapture : undefined}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={styles.emptyHeroCarouselCanvas}
          onClick={interactive ? handleCanvasClick : undefined}
          onPointerMove={interactive ? handleCanvasHover : undefined}
        />
        {icons.map((icon, index) => {
          // Visually-hidden switchers keep the ring reachable by keyboard,
          // screen readers, and DOM-level tests; visuals live on the canvas.
          const isCenter = index === centerIndex;
          const target = targetForIndex(index);
          const key = `${icon.provider}:${icon.iconUrl}`;
          if (target && onProviderSelect) {
            const label = providerSelectLabel
              ? `${providerSelectLabel}: ${target.label}`
              : target.label;
            return (
              <button
                key={key}
                type="button"
                className={styles.emptyHeroCarouselItem}
                data-provider={icon.provider}
                data-provider-active={isCenter}
                aria-label={label}
                aria-pressed={isCenter}
                title={target.label}
                onClick={() => handleItemClick(index)}
              >
                {target.label}
              </button>
            );
          }
          return (
            <span
              key={key}
              className={styles.emptyHeroCarouselItem}
              data-provider={icon.provider}
              data-provider-active={isCenter}
            />
          );
        })}
      </div>
    );
  }
);
