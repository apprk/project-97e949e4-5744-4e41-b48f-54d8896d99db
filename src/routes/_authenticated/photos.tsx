import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FolderPlus, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/photos")({
  head: () => ({
    meta: [
      { title: "写真管理 | 三条工場 業務管理" },
      { name: "description", content: "設備写真・改善写真をカメラ撮影またはアップロードで記録し、フォルダや年月で整理します。" },
      { property: "og:title", content: "写真管理 | 三条工場 業務管理" },
      { property: "og:description", content: "撮影・アップロードした写真をフォルダや年月で整理して管理します。" },
    ],
  }),
  component: PhotosPage,
});

type Folder = { id: string; name: string };
type Photo = {
  id: string;
  user_id: string;
  storage_path: string;
  comment: string | null;
  folder_id: string | null;
  taken_at: string;
};

function PhotosPage() {
  const { session } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [view, setView] = useState<string>("all");
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [comment, setComment] = useState("");
  const [folderId, setFolderId] = useState<string>("none");
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [{ data: f }, { data: p }] = await Promise.all([
      supabase.from("photo_folders").select("id,name").is("deleted_at", null).order("name"),
      supabase
        .from("photos")
        .select("id,user_id,storage_path,comment,folder_id,taken_at")
        .is("deleted_at", null)
        .order("taken_at", { ascending: false }),
    ]);
    setFolders((f as Folder[]) ?? []);
    const list = (p as Photo[]) ?? [];
    setPhotos(list);
    const map: Record<string, string> = {};
    await Promise.all(
      list.map(async (ph) => {
        const { data } = await supabase.storage.from("photos").createSignedUrl(ph.storage_path, 3600);
        if (data?.signedUrl) map[ph.id] = data.signedUrl;
      }),
    );
    setUrls(map);
  };

  useEffect(() => {
    void load();
  }, []);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setPending({ file, preview: URL.createObjectURL(file) });
    setComment("");
    setFolderId("none");
  };

  const upload = async () => {
    if (!pending || !session) return;
    setUploading(true);
    const ext = pending.file.name.split(".").pop() || "jpg";
    const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("photos").upload(path, pending.file);
    if (upErr) {
      setUploading(false);
      toast.error("アップロードに失敗しました");
      return;
    }
    const { error } = await supabase.from("photos").insert({
      user_id: session.user.id,
      storage_path: path,
      comment: comment || null,
      folder_id: folderId === "none" ? null : folderId,
    });
    setUploading(false);
    if (error) {
      toast.error("保存に失敗しました");
      return;
    }
    toast.success("写真を保存しました");
    setPending(null);
    void load();
  };

  const addFolder = async () => {
    const name = window.prompt("フォルダ名");
    if (!name || !session) return;
    const { error } = await supabase.from("photo_folders").insert({ user_id: session.user.id, name });
    if (error) {
      toast.error("作成に失敗しました");
      return;
    }
    void load();
  };

  const renameFolder = async (f: Folder) => {
    const name = window.prompt("新しいフォルダ名", f.name);
    if (!name) return;
    await supabase.from("photo_folders").update({ name }).eq("id", f.id);
    void load();
  };

  const deleteFolder = async (f: Folder) => {
    await supabase.from("photo_folders").update({ deleted_at: new Date().toISOString() }).eq("id", f.id);
    toast.success("フォルダをごみ箱へ移動しました");
    if (view === `folder:${f.id}`) setView("all");
    void load();
  };

  const removePhoto = async (id: string) => {
    await supabase.from("photos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    toast.success("ごみ箱へ移動しました");
    void load();
  };

  const months = useMemo(
    () => Array.from(new Set((photos ?? []).map((p) => p.taken_at.slice(0, 7)))).sort().reverse(),
    [photos],
  );
  const years = useMemo(
    () => Array.from(new Set((photos ?? []).map((p) => p.taken_at.slice(0, 4)))).sort().reverse(),
    [photos],
  );

  const shown = (photos ?? []).filter((p) => {
    if (view === "all") return true;
    if (view.startsWith("folder:")) return p.folder_id === view.slice(7);
    if (view.startsWith("year:")) return p.taken_at.startsWith(view.slice(5));
    if (view.startsWith("month:")) return p.taken_at.startsWith(view.slice(6));
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="写真管理" />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-4">
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" className="h-14" onClick={() => cameraRef.current?.click()}>
            <Camera className="size-5" /> 撮影
          </Button>
          <Button size="lg" variant="outline" className="h-14 bg-card" onClick={() => fileRef.current?.click()}>
            <Upload className="size-5" /> 端末から追加
          </Button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />

        <div className="mt-4 flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label>表示</Label>
            <Select value={view} onValueChange={setView}>
              <SelectTrigger className="h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全件</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={`year:${y}`}>
                    {y}年
                  </SelectItem>
                ))}
                {months.map((m) => (
                  <SelectItem key={m} value={`month:${m}`}>
                    {m.replace("-", "年")}月
                  </SelectItem>
                ))}
                {folders.map((f) => (
                  <SelectItem key={f.id} value={`folder:${f.id}`}>
                    フォルダ: {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="h-12 bg-card" onClick={addFolder}>
            <FolderPlus className="size-5" />
          </Button>
        </div>

        {view.startsWith("folder:") ? (
          <div className="mt-2 flex gap-2">
            {(() => {
              const f = folders.find((x) => x.id === view.slice(7));
              if (!f) return null;
              return (
                <>
                  <Button variant="ghost" size="sm" onClick={() => renameFolder(f)}>
                    <Pencil className="size-4" /> 名前変更
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteFolder(f)}>
                    <Trash2 className="size-4" /> フォルダ削除
                  </Button>
                </>
              );
            })()}
          </div>
        ) : null}

        {photos === null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : shown.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">写真がありません。</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-xl border border-border bg-card">
                {urls[p.id] ? (
                  <img
                    src={urls[p.id]}
                    alt={p.comment || "記録写真"}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full bg-muted" />
                )}
                <div className="p-2">
                  <p className="text-xs text-muted-foreground">{new Date(p.taken_at).toLocaleString("ja-JP")}</p>
                  <p className="line-clamp-2 text-sm">{p.comment}</p>
                  <Button variant="ghost" size="sm" className="mt-1 h-8 px-2" onClick={() => removePhoto(p.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>写真を保存</DialogTitle>
          </DialogHeader>
          {pending ? (
            <div className="space-y-4">
              <img src={pending.preview} alt="プレビュー" className="max-h-64 w-full rounded-lg object-contain" />
              <div className="space-y-1.5">
                <Label htmlFor="photo-comment">コメント</Label>
                <Textarea
                  id="photo-comment"
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>フォルダ</Label>
                <Select value={folderId} onValueChange={setFolderId}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未分類</SelectItem>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="lg" className="h-12 w-full" disabled={uploading} onClick={upload}>
                {uploading ? <Loader2 className="size-5 animate-spin" /> : null} 保存
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      <Input className="hidden" aria-hidden readOnly />
    </div>
  );
}
