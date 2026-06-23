"use client";
/**
 * DoorTransition — "push open a door into light"
 *
 * Two dark panels part from the center while warm lamp-light blooms through,
 * then the callback fires (router.push). ~650 ms total.
 *
 * Respects prefers-reduced-motion: skips the animation and invokes callback
 * immediately.
 *
 * Usage:
 *   const { enter, Overlay } = useDoorEnter();
 *   // Once in the component tree:
 *   <Overlay />
 *   // To navigate:
 *   enter("/play?world=abc");
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DOOR_MS = 650;

interface OverlayState {
  visible: boolean;
  animating: boolean;
}

export function useDoorEnter(): {
  enter: (href: string) => void;
  Overlay: () => React.ReactElement | null;
} {
  const router = useRouter();
  const [state, setState] = useState<OverlayState>({ visible: false, animating: false });
  const hrefRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = useCallback(
    (href: string) => {
      // Respect prefers-reduced-motion — skip straight to navigation
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        router.push(href);
        return;
      }

      hrefRef.current = href;
      setState({ visible: true, animating: true });

      // After the doors have parted (~80% through), push the route
      // so Next.js hydrates in the background while the bloom is still showing.
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        router.push(hrefRef.current);
        // Hide overlay shortly after navigation starts
        setTimeout(() => setState({ visible: false, animating: false }), 80);
      }, Math.round(DOOR_MS * 0.72));
    },
    [router],
  );

  const Overlay = useCallback((): React.ReactElement | null => {
    if (!state.visible) return null;

    const dur = `${DOOR_MS}ms`;

    return (
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          pointerEvents: state.animating ? "all" : "none",
          overflow: "hidden",
        }}
      >
        {/* Warm lamp bloom at the center seam */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 60% 70% at 50% 50%, rgba(240, 195, 107, 0.55) 0%, rgba(240, 195, 107, 0.18) 40%, transparent 70%)",
            animation: `door-light ${dur} cubic-bezier(0.4, 0, 0.2, 1) both`,
          }}
        />
        {/* Left door panel */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "50%",
            height: "100%",
            background:
              "linear-gradient(to right, #07090e 60%, #0e1320 100%)",
            animation: `door-left ${dur} cubic-bezier(0.76, 0, 0.24, 1) both`,
          }}
        />
        {/* Right door panel */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "50%",
            height: "100%",
            background:
              "linear-gradient(to left, #07090e 60%, #0e1320 100%)",
            animation: `door-right ${dur} cubic-bezier(0.76, 0, 0.24, 1) both`,
          }}
        />
      </div>
    );
  }, [state]);

  return { enter, Overlay };
}
