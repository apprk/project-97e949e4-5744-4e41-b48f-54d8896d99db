import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { TABLE_SCROLL } from "@/lib/purchases";

/** One native horizontal track shared with the table, pinned to the viewport. */
export function PurchaseScroll({ children, scrollRef }: { children: ReactNode; scrollRef?: RefObject<HTMLDivElement | null> | undefined }) {
  const localTable = useRef<HTMLDivElement>(null);
  const table = scrollRef ?? localTable;
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = table.current;
    if (!el) return;
    const update = () => setWidth(el.scrollWidth);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    update();
    return () => observer.disconnect();
  }, [children]);
  return <>
    <div ref={table} data-purchase-scroll className={TABLE_SCROLL} onScroll={() => {
      if (track.current && table.current) track.current.scrollLeft = table.current.scrollLeft;
    }}>{children}</div>
    <div className="fixed inset-x-3 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
      <div ref={track} role="region" aria-label="横スクロール" className="purchase-scroll-track h-6 overflow-x-scroll overflow-y-hidden" onScroll={() => {
        if (table.current && track.current) table.current.scrollLeft = track.current.scrollLeft;
      }}><div style={{ width }} className="h-px" /></div>
    </div>
  </>;
}