"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Press Enter anywhere on the landing to reach the Enter screen. It only fires when nothing is focused,
// so it never takes Enter away from a link, button or field.
export function EnterShortcut() {
  const router = useRouter();
  useEffect(() => {
    router.prefetch("/enter");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement) return;
      event.preventDefault();
      router.push("/enter");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);
  return null;
}
