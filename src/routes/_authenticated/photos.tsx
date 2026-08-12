import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, FolderPlus, Loader2, Pencil, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/photos")({
  head: () => ({
    meta: [
      { title: "写真 | 三条工場 業務管理" },
      {
        name: "description",
        content: "設備写真・改善写真をカメラ撮影またはアップロードで記録し、複数フォルダで整理します。",
      },
      { property: "og:title", content: "写真 | 三条工場 業務管理" },
      { property: "og:description", content: "撮影・アップロードした写真をフォルダで整理して管理します。" },
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
  checked: boolean;
  taken_at: string;
};
type Item = { photo_id: string; folder_id: string };

function PhotosPage() {
  const { session } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [view, setView] = useState<string>("all");
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [comment, setComment] = useState("");
  const [pendingFolders, setPendingFolders] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [opened, setOpened] = useState<Photo | null>(null);
  const [openComment, setOpenComment] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [{ data: f }, { data: p }, { data: it }] = await Promise.all([
      supabase.from("photo_folders").select("id,name").is("deleted_at", null).order("name"),
      supabase
        .from("photos")
        .select("id,user_id,storage_path,comment,folder_id,checked,taken_at")
        .is("deleted_at", null)
        .order("taken_at", { ascending: false }),
      supabase.from("photo_folder_items").select("photo_id,folder_id"),
    ]);
    setFolders((f as Folder[]) ?? []);
    setItems((it as Item[]) ?? []);
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

  const foldersOf = (photoId: string) => items.filter((i) => i.photo_id === photoId).map((i) => i.folder_id);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setPending({ file, preview: URL.createObjectURL(file) });
    setComment("");
    setPendingFolders(view.startsWith("folder:") ? [view.slice(7)] : []);
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
    const { data: inserted, error } = await supabase
      .from("photos")
      .insert({ user_id: session.user.id, storage_path: path, comment: comment || null })
      .select("id")
      .single();
    if (!error && inserted && pendingFolders.length > 0) {
      await supabase
        .from("photo_folder_items")
        .insert(pendingFolders.map((fid) => ({ photo_id: inserted.id, folder_id: fid, user_id: session.user.id })));
    }
    setUploading(false);
    if (error) {
      toast.error("保存に失敗しました");
      return;
    }
    toast.success("写真を保存しました");
    setPending(null);
    void load();
  };

  const toggleFolder = async (photo: Photo, folderId: string, on: boolean) => {
    if (!session) return;
    if (on) {
      await supabase
        .from("photo_folder_items")
        .insert({ photo_id: photo.id, folder_id: folderId, user_id: photo.user_id });
    } else {
      await supabase.from("photo_folder_items").delete().eq("photo_id", photo.id).eq("folder_id", folderId);
    }
    void load();
  };

  const toggleChecked = async (photo: Photo, on: boolean) => {
    setPhotos((prev) => (prev ?? []).map((p) => (p.id === photo.id ? { ...p, checked: on } : p)));
    const { error } = await supabase.from("photos").update({ checked: on }).eq("id", photo.id);
    if (error) toast.error("更新に失敗しました");
  };

  const saveComment = async () => {
    if (!opened) return;
    const { error } = await supabase.from("photos").update({ comment: openComment || null }).eq("id", opened.id);
    if (error) {
      toast.error("保存に失敗しました");
      return;
    }
    toast.success("保存しました");
    setOpened({ ...opened, comment: openComment || null });
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
    await supabase.from("photo_folder_items").delete().eq("folder_id", f.id);
    toast.success("フォルダをごみ箱へ移動しました（写真は全件に残ります）");
    if (view === `folder:${f.id}`) setView("all");
    void load();
  };

  const removePhoto = async (id: string) => {
    await supabase.from("photos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    toast.success("ごみ箱へ移動しました");
    setOpened(null);
    void load();
  };

  const shown = useMemo(() => {
    const list = photos ?? [];
    if (!view.startsWith("folder:")) return list;
    const fid = view.slice(7);
    const ids = new Set(items.filter((i) => i.folder_id === fid).map((i) => i.photo_id));
    return list.filter((p) => ids.has(p.id));
  }, [photos, items, view]);

  const activeFolder = view.startsWith("folder:") ? folders.find((f) => f.id === view.slice(7)) : undefined;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="写真" />
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

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant={view === "all" ? "default" : "outline"}
            size="sm"
            className={view === "all" ? "" : "bg-card"}
            onClick={() => setView("all")}
          >
            全件
          </Button>
          {folders.map((f) => (
            <Button
              key={f.id}
              variant={view === `folder:${f.id}` ? "default" : "outline"}
              size="sm"
              className={view === `folder:${f.id}` ? "" : "bg-card"}
              onClick={() => setView(`folder:${f.id}`)}
            >
              {f.name}
            </Button>
          ))}
          <Button variant="ghost" size="sm" aria-label="フォルダを追加" onClick={addFolder}>
            <FolderPlus className="size-5" />
          </Button>
        </div>

        {activeFolder ? (
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => renameFolder(activeFolder)}>
              <Pencil className="size-4" /> 名前変更
            </Button>
            <Button variant="ghost" size="sm" onClick={() => deleteFolder(activeFolder)}>
              <Trash2 className="size-4" /> フォルダ削除
            </Button>
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
              <li key={p.id} className="relative overflow-hidden rounded-xl border border-border bg-card">
                <button
                  type="button"
                  className="block w-full"
                  aria-label="写真を拡大"
                  onClick={() => {
                    setOpened(p);
                    setOpenComment(p.comment ?? "");
                  }}
                >
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
                </button>
                <label className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs font-medium shadow">
                  <Checkbox checked={p.checked} onCheckedChange={(v) => void toggleChecked(p, v === true)} />
                  確認
                </label>
                {p.checked ? (
                  <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                    <Check className="size-4" />
                  </span>
                ) : null}
                <div className="p-2">
                  <p className="text-xs text-muted-foreground">{new Date(p.taken_at).toLocaleString("ja-JP")}</p>
                  <p className="line-clamp-2 text-sm">{p.comment}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* 保存ダイアログ */}
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
                <Textarea id="photo-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>フォルダ（未選択なら「全件」のみ）</Label>
                {folders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">フォルダはまだありません。</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {folders.map((f) => (
                      <label key={f.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={pendingFolders.includes(f.id)}
                          onCheckedChange={(v) =>
                            setPendingFolders((prev) =>
                              v === true ? [...prev, f.id] : prev.filter((x) => x !== f.id),
                            )
                          }
                        />
                        {f.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <Button size="lg" className="h-12 w-full" disabled={uploading} onClick={upload}>
                {uploading ? <Loader2 className="size-5 animate-spin" /> : null} 保存
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 拡大表示ダイアログ */}
      <Dialog open={!!opened} onOpenChange={(o) => !o && setOpened(null)}>
        <DialogContent className="max-h-[95vh] w-[96vw] max-w-3xl overflow-y-auto p-3">
          <DialogHeader>
            <DialogTitle className="text-base">
              {opened ? new Date(opened.taken_at).toLocaleString("ja-JP") : ""}
            </DialogTitle>
          </DialogHeader>
          {opened ? (
            <div className="space-y-3">
              {urls[opened.id] ? (
                <img
                  src={urls[opened.id]}
                  alt={opened.comment || "記録写真"}
                  className="max-h-[62vh] w-full rounded-lg bg-black/5 object-contain"
                />
              ) : null}
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={opened.checked}
                  onCheckedChange={(v) => {
                    const on = v === true;
                    setOpened({ ...opened, checked: on });
                    void toggleChecked(opened, on);
                  }}
                />
                確認済み
              </label>
              <div className="space-y-1.5">
                <Label htmlFor="open-comment">コメント</Label>
                <Textarea
                  id="open-comment"
                  rows={2}
                  value={openComment}
                  onChange={(e) => setOpenComment(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>フォルダ（複数選択可・全件からは消えません）</Label>
                {folders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">フォルダはまだありません。</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {folders.map((f) => (
                      <label key={f.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={foldersOf(opened.id).includes(f.id)}
                          onCheckedChange={(v) => void toggleFolder(opened, f.id, v === true)}
                        />
                        {f.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 pb-1">
                <Button className="h-12 flex-1" onClick={saveComment}>
                  保存
                </Button>
                <Button variant="destructive" className="h-12" onClick={() => removePhoto(opened.id)}>
                  <Trash2 className="size-5" />
                </Button>
                <Button variant="outline" className="h-12 bg-card" onClick={() => setOpened(null)}>
                  <X className="size-5" />
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
