import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Image as ImageIcon, Loader2, Paperclip, Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signAttachments } from "@/lib/attachments.functions";
import { toHira } from "@/lib/purchases";
import type { Supplier } from "@/components/AdminSettings";

/* ---------------- 発注先入力（発注先マスタから候補） ---------------- */

export function matchSuppliers(list: Supplier[], q: string) {
  const k = toHira(q.trim());
  if (!k) return [];
  return list.filter((s) => toHira(s.name).includes(k)).slice(0, 8);
}

export function SupplierInput({
  value,
  onChange,
  onCommit,
  suppliers,
  className = "h-9",
}: {
  value: string;
  onChange: (v: string) => void;
  /** 確定（候補クリック・Enter・フォーカスアウト） */
  onCommit?: (v: string) => void;
  suppliers: Supplier[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const currentValue = useRef(value);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  currentValue.current = value;
  useEffect(() => () => { if (blurTimer.current) clearTimeout(blurTimer.current); }, []);
  const list = useMemo(() => matchSuppliers(suppliers, value), [suppliers, value]);
  const show = open && list.length > 0 && !(list.length === 1 && list[0]?.name === value);
  const pick = (v: string) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    currentValue.current = v;
    onChange(v);
    setOpen(false);
    onCommit?.(v);
  };
  return (
    <div className="relative">
      <Input
        className={`${className} min-w-0 px-1.5 text-sm`}
        placeholder="発注先"
        aria-label="発注先"
        value={value}
        onChange={(e) => {
          currentValue.current = e.target.value;
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); setOpen(true); }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => {
            setOpen(false);
            onCommit?.(currentValue.current);
          }, 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (show && list[0]) pick(list[0].name);
            else (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {show ? (
        <ul className="absolute left-0 top-full z-30 mt-1 max-h-60 w-52 overflow-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          {list.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-2 px-3 py-2.5 text-left hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s.name)}
              >
                <span className="font-bold">{s.name}</span>
                {s.vendor_no ? <span className="text-xs text-muted-foreground">{s.vendor_no}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ---------------- 写真添付 ---------------- */

export type PendingAttach = { key: string; file?: File; photo?: { id: string; storage_path: string }; preview: string };
export type Attachment = { id: string; purchase_id: string; storage_path: string; photo_id: string | null };

/** 添付を保存（端末の写真はアップロード、アプリ内の写真は参照のみ） */
export async function saveAttachments(purchaseId: string, uid: string, items: PendingAttach[]) {
  let ok = 0;
  for (const it of items) {
    let path = it.photo?.storage_path;
    if (it.file) {
      const ext = (it.file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      path = `${uid}/purchase-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("photos").upload(path, it.file, { contentType: it.file.type || "image/jpeg" });
      if (error) continue;
    }
    if (!path) continue;
    const { error } = await supabase
      .from("purchase_attachments")
      .insert({ purchase_id: purchaseId, user_id: uid, storage_path: path, photo_id: it.photo?.id ?? null });
    if (!error) ok++;
  }
  if (ok < items.length) toast.error("一部の写真を添付できませんでした");
  return ok;
}

/** 📎：デバイスから選択 / アプリ内の写真から選択 */
export function AttachPicker({
  onPick,
  count,
  children,
}: {
  onPick: (items: PendingAttach[]) => void;
  count?: number;
  children?: React.ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [lib, setLib] = useState(false);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="写真を添付"
            title="写真を添付"
            onClick={(e) => e.stopPropagation()}
          >
            <Paperclip className="size-4" />
            {count ? (
              <span className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">{count}</span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72" onClick={(e) => e.stopPropagation()}>
          {children}
          <div className="grid gap-2">
            <Button variant="outline" className="h-11 justify-start bg-card" onClick={() => fileRef.current?.click()}>
              <Smartphone className="size-4" /> デバイスから選択
            </Button>
            <Button
              variant="outline"
              className="h-11 justify-start bg-card"
              onClick={() => {
                setOpen(false);
                setLib(true);
              }}
            >
              <ImageIcon className="size-4" /> アプリ内の写真から選択
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          setOpen(false);
          onPick(files.map((f) => ({ key: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f) })));
        }}
      />
      <PhotoLibraryDialog open={lib} onOpenChange={setLib} onPick={onPick} />
    </>
  );
}

function PhotoLibraryDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (items: PendingAttach[]) => void;
}) {
  const [list, setList] = useState<{ id: string; storage_path: string; url: string }[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setSel(new Set());
    setList(null);
    void (async () => {
      const { data } = await supabase
        .from("photos")
        .select("id,storage_path")
        .is("deleted_at", null)
        .order("taken_at", { ascending: false })
        .limit(150);
      const rows = data ?? [];
      const { data: signed } = rows.length
        ? await supabase.storage.from("photos").createSignedUrls(rows.map((r) => r.storage_path), 3600)
        : { data: [] };
      setList(rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? "" })).filter((r) => r.url));
    })();
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>アプリ内の写真から選択</DialogTitle>
        </DialogHeader>
        {list === null ? (
          <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">写真がありません</p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-auto sm:grid-cols-5">
            {list.map((p) => {
              const on = sel.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`relative aspect-square overflow-hidden rounded-lg border-4 ${on ? "border-primary" : "border-transparent"}`}
                  onClick={() => setSel((s) => { const n = new Set(s); if (on) n.delete(p.id); else n.add(p.id); return n; })}
                >
                  <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />
                </button>
              );
            })}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            disabled={sel.size === 0}
            onClick={() => {
              onPick((list ?? []).filter((p) => sel.has(p.id)).map((p) => ({ key: p.id, photo: { id: p.id, storage_path: p.storage_path }, preview: p.url })));
              onOpenChange(false);
            }}
          >
            {sel.size}枚を添付
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 新規入力行で選んだ（まだ保存前の）写真 */
export function PendingThumbs({ items, onRemove }: { items: PendingAttach[]; onRemove: (key: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {items.map((it) => (
        <div key={it.key} className="relative size-10 overflow-hidden rounded border border-border">
          <img src={it.preview} alt="" className="size-full object-cover" />
          <button
            type="button"
            className="absolute right-0 top-0 rounded-bl bg-background/80 p-0.5"
            aria-label="添付を外す"
            onClick={() => onRemove(it.key)}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** 既存行の📎：添付写真の表示と追加 */
export function RowAttachments({
  purchaseId,
  items,
  canAdd,
  canRemove,
  uid,
  onChanged,
}: {
  purchaseId: string;
  items: Attachment[];
  canAdd: boolean;
  canRemove: boolean;
  uid: string;
  onChanged: () => void;
}) {
  const sign = useServerFn(signAttachments);
  const [view, setView] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!view || !items.length) return;
    void sign({ data: { ids: items.map((a) => a.id) } }).then(setUrls).catch(() => {});
  }, [view, items]);
  const add = async (picked: PendingAttach[]) => {
    const n = await saveAttachments(purchaseId, uid, picked);
    if (n) toast.success(`${n}枚添付しました`);
    onChanged();
  };
  const remove = async (a: Attachment) => {
    if (!window.confirm("この添付を外しますか？（写真機能の写真は消えません）")) return;
    const { error } = await supabase.from("purchase_attachments").update({ deleted_at: new Date().toISOString() }).eq("id", a.id);
    if (error) toast.error("外せませんでした");
    onChanged();
  };
  return (
    <>
      {items.length ? (
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-1 text-xs font-bold text-primary hover:bg-accent"
          title="添付写真を見る"
          onClick={(e) => { e.stopPropagation(); setView(true); }}
        >
          <ImageIcon className="size-4" />{items.length}
        </button>
      ) : null}
      {canAdd ? <AttachPicker onPick={add} /> : null}
      <Dialog open={view} onOpenChange={setView}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>添付写真</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[70vh] grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">
            {items.map((a) => (
              <div key={a.id} className="relative overflow-hidden rounded-lg border border-border bg-muted">
                {urls[a.id] ? (
                  <a href={urls[a.id]} target="_blank" rel="noopener noreferrer">
                    <img src={urls[a.id]} alt="添付写真" className="aspect-square w-full object-contain" />
                  </a>
                ) : (
                  <div className="flex aspect-square items-center justify-center"><Loader2 className="size-5 animate-spin" /></div>
                )}
                {canRemove || a.storage_path.startsWith(uid + "/") ? (
                  <Button size="sm" variant="secondary" className="absolute right-1 top-1 h-7 px-2 text-xs" onClick={() => remove(a)}>外す</Button>
                ) : null}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
