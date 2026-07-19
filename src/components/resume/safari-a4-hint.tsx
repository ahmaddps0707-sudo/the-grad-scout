import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TW = 220;
const TH_EST = 72;
const MARGIN = 16;
const GAP = 8;

type Pos = {
  top: number;
  left: number;
  placement: "top" | "bottom";
  caretLeft: number;
};

export function SafariA4Hint() {
  const [isSafari, setIsSafari] = useState(false);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  useEffect(() => {
    setIsSafari(/^((?!chrome|android).)*safari/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const centerX = r.left + r.width / 2;
      let left = centerX - TW / 2;
      if (left + TW > vw - MARGIN) left = vw - MARGIN - TW;
      if (left < MARGIN) left = MARGIN;

      let placement: "top" | "bottom" = "top";
      let top = r.top - GAP - TH_EST;
      if (top < MARGIN) {
        placement = "bottom";
        top = r.bottom + GAP;
        if (top + TH_EST > vh - MARGIN) top = Math.max(MARGIN, vh - MARGIN - TH_EST);
      }

      const caretLeft = Math.max(10, Math.min(TW - 10, centerX - left));
      setPos({ top, left, placement, caretLeft });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-safari-a4-hint]")) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  if (!isSafari) return null;

  return (
    <span
      ref={anchorRef}
      data-safari-a4-hint
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Safari PDF hint"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/40 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
      >
        i
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <span
          role="tooltip"
          className="pointer-events-none"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 9999,
            background: "#1A1A2E",
            color: "#fff",
            fontSize: "12px",
            lineHeight: 1.4,
            borderRadius: "8px",
            padding: "8px 12px",
            maxWidth: `${TW}px`,
            width: "max-content",
          }}
        >
          This preview is sized to A4. Select A4 in Safari's print dialog to get a PDF that matches exactly — otherwise page breaks on longer resumes may shift.
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: `${pos.caretLeft}px`,
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              ...(pos.placement === "top"
                ? { top: "100%", borderTop: "5px solid #1A1A2E" }
                : { bottom: "100%", borderBottom: "5px solid #1A1A2E" }),
            }}
          />
        </span>,
        document.body
      )}
    </span>
  );
}