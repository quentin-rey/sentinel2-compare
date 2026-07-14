import { useEffect } from "react";

/**
 * touch-action CSS (see style.css's html/body rule) stops standard
 * pinch/double-tap browser zoom, but iOS Safari's page pinch-zoom fires as
 * its own proprietary gesture events (gesturestart/gesturechange), which
 * touch-action doesn't cover at all — hence this JS-level fallback.
 * MapLibre's own pinch-to-zoom-the-map keeps working: it manages the map
 * transform itself in its touch handlers regardless of what happens here.
 */
export function useDisablePinchZoom() {
  useEffect(() => {
    const preventGesture = (e: Event) => e.preventDefault();
    const preventMultiTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };

    document.addEventListener("gesturestart", preventGesture);
    document.addEventListener("gesturechange", preventGesture);
    document.addEventListener("touchmove", preventMultiTouchMove, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("touchmove", preventMultiTouchMove);
    };
  }, []);
}
