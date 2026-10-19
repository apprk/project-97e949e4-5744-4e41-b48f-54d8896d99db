import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/trash")({
  head: () => ({
    meta: [
      { title: "ごみ箱 | 三条工場 業務管理" },
      { name: "description", content: "削除したスケジュール・写真・設備・履歴を復元または完全削除します。" },
      { property: "og:title", content: "ごみ箱 | 三条工場 業務管理" },
      { property: "og:description", content: "削除データの復元と完全削除（管理者専用）。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrashPage,
});

type Kind = "schedules" | "photos" | "equipment" | "equipment_history" | "photo_folders";
type Item = { id: string; label: string; deleted_at: string; kind: Kind };

const KIND_LABEL: Record<Kind, string> = {
  schedules: "スケジュール",
  photos: "写真",
  equipment: "設備",
  equipment_history: "設備履歴",
  photo_folders: "写真フォルダ",
};

function TrashPage() {
  const { can } = useAuth();
  const isAdmin = can("trash");
  const [items, setItems] = useState<Item[] | null>(null);

  const load = async () => {
    const [sch, pho, eq, hist, fol] = await Promise.all([
      supabase.from("schedules").select("id,entry_date,deleted_at").not("deleted_at", "is", null),
      supabase.from("photos").select("id,comment,taken_at,deleted_at").not("deleted_at", "is", null),
      supabase.from("equipment").select("id,name,deleted_at").not("deleted_at", "is", null),
      supabase.from("equipment_history").select("id,performed_on,deleted_at").not("deleted_at", "is", null),
      supabase.from("photo_folders").select("id,name,deleted_at").not("deleted_at", "is", null),
    ]);
    const list: Item[] = [
      ...(sch.data ?? []).map((r) => ({ id: r.id, label: r.entry_date, deleted_at: r.deleted_at!, kind: "schedules" as Kind })),
      ...(pho.data ?? []).map((r) => ({
        id: r.id,
        label: r.comment || new Date(r.taken_at).toLocaleString("ja-JP"),
        deleted_at: r.deleted_at!,
        kind: "photos" as Kind,
      })),
      ...(eq.data ?? []).map((r) => ({ id: r.id, label: r.name, deleted_at: r.deleted_at!, kind: "equipment" as Kind })),
      ...(hist.data ?? []).map((r) => ({
        id: r.id,
        label: r.performed_on,
        deleted_at: r.deleted_at!,
        kind: "equipment_history" as Kind,
      })),
      ...(fol.data ?? []).map((r) => ({ id: r.id, label: r.name, deleted_at: r.deleted_at!, kind: "photo_folders" as Kind })),
    ].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    setItems(list);
  };

  useEffect(() => {
    void load();
  }, []);

  const restore = async (it: Item) => {
    const { error } = await supabase.from(it.kind).update({ deleted_at: null }).eq("id", it.id);
    if (error) {
      toast.error("復元に失敗しました");
      return;
    }
    toast.success("復元しました");
    void load();
  };

  const purge = async (it: Item) => {
    if (!window.confirm("完全に削除します。よろしいですか？")) return;
    const { error } = await supabase.from(it.kind).delete().eq("id", it.id);
    if (error) {
      toast.error("削除に失敗しました");
      return;
    }
    toast.success("完全に削除しました");
    void load();
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="ごみ箱" />
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">ごみ箱を利用する権限がありません。</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="ごみ箱" />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-4">
        <p className="text-xs text-muted-foreground">
          削除したデータは保管期間（設定で変更可能・初期30日）を過ぎると自動的に削除されます。
        </p>
        {items === null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">ごみ箱は空です。</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((it) => (
              <li key={`${it.kind}-${it.id}`} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-accent-foreground">{KIND_LABEL[it.kind]}</p>
                    <p className="truncate text-base font-bold">{it.label}</p>
                    <p className="text-xs text-muted-foreground">
                      削除日: {new Date(it.deleted_at).toLocaleString("ja-JP")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" className="h-11 bg-card" onClick={() => restore(it)}>
                      <RotateCcw className="size-4" /> 復元
                    </Button>
                    <Button variant="destructive" className="h-11" onClick={() => purge(it)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
