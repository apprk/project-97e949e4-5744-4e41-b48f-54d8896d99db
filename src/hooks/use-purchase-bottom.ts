import { useCallback, useEffect, useRef } from "react";

/** Initial positioning belongs to the screen, not updates to its rows or filters. */
export function usePurchaseBottom(ready: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    el.scrollIntoView({ block: "end", inline: "nearest" });
  }, []);
  useEffect(() => {
    if (!ready || initialized.current) return;
    const frame = requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      initialized.current = true;
      scrollToBottom();
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, scrollToBottom]);
  return { scrollRef, scrollToBottom };
}