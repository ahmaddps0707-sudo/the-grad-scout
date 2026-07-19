import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function SafariA4Hint() {
  const [isSafari, setIsSafari] = useState(false);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setIsSafari(/^((?!chrome|android).)*safari/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({ top: r.top, left: r.left + r.width / 2 });
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
            top: pos.top - 8,
            left: pos.left,
            transform: "translate(-50%, -100%)",
            zIndex: 9999,
            background: "#1A1A2E",
            color: "#fff",
            fontSize: "12px",
            lineHeight: 1.4,
            borderRadius: "8px",
            padding: "8px 12px",
            maxWidth: "220px",
            width: "max-content",
          }}
        >
          For best results in Safari, in the print dialog select Paper Size: A4 before saving as PDF.
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid #1A1A2E",
            }}
          />
        </span>,
        document.body
      )}
    </span>
  );
}