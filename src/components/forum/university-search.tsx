import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";

type Uni = { id: string; name: string; country: string | null };

export function UniversitySearch({
  value,
  onChange,
  placeholder = "Search universities…",
}: {
  value: { id: string; name: string } | null;
  onChange: (u: { id: string; name: string } | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Uni[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value || !q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("universities")
        .select("id, name, country")
        .ilike("name", `%${q.trim()}%`)
        .limit(8);
      setResults(data ?? []);
      setOpen(true);
    }, 220);
    return () => clearTimeout(t);
  }, [q, value]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm">
        <span className="flex-1 truncate">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        onFocus={() => q && setOpen(true)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
          {results.map((u) => (
            <button
              type="button"
              key={u.id}
              onClick={() => { onChange({ id: u.id, name: u.name }); setQ(""); setOpen(false); }}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-secondary"
            >
              <span className="font-medium">{u.name}</span>
              {u.country && <span className="text-xs text-muted-foreground">{u.country}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}