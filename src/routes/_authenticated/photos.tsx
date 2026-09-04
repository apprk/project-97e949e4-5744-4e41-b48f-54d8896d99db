import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, FolderPlus, FolderInput, Loader2, Pencil, RotateCw, Trash2, Upload, X } from "lucide-react";
import { CameraCapture } from "@/components/CameraCapture";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
type CheckFilter = "all" | "checked" | "unchecked";

function PhotosPage() {
  const { session } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [view, setView] = useState<string>("all");
  const [filter, setFilter] = useState<CheckFilter>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<{ file: File; preview: string; fromCamera: boolean } | null>(null);
  const [comment, setComment] = useState("");
  const [pendingFolders, setPendingFolders] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [opened, setOpened] = useState<Photo | null>(null);
  const [openComment, setOpenComment] = useState("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkFolderOpen, setBulkFolderOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
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

  const pick = (file: File | undefined, fromCamera: boolean) => {
    if (!file) return;
    setPending({ file, preview: URL.createObjectURL(file), fromCamera });
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
    const again = pending.fromCamera;
    setPending(null);
    void load();
    // 現場で連続撮影できるよう、撮影の場合はカメラを再度開く
    if (again) setTimeout(() => cameraRef.current?.click(), 250);
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
    if (view === `folder:${f.id}`) changeView("all");
    void load();
  };

  const removePhoto = async (id: string) => {
    await supabase.from("photos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    toast.success("ごみ箱へ移動しました");
    setOpened(null);
    setSelected((prev) => prev.filter((x) => x !== id));
    void load();
  };

  /** 選択した写真をまとめてごみ箱へ（所属する全フォルダから見えなくなる） */
  const bulkDelete = async () => {
    if (selected.length === 0) return;
    const { error } = await supabase
      .from("photos")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", selected);
    setConfirmBulkDelete(false);
    if (error) {
      toast.error("削除に失敗しました");
      return;
    }
    toast.success(`${selected.length}件をごみ箱へ移動しました`);
    setSelected([]);
    void load();
  };

  /** 選択した写真をまとめてフォルダへ追加（実体は1枚のまま） */
  const bulkAddToFolder = async (folderId: string) => {
    if (selected.length === 0 || !session) return;
    const existing = new Set(items.filter((i) => i.folder_id === folderId).map((i) => i.photo_id));
    const rows = selected
      .filter((id) => !existing.has(id))
      .map((id) => ({ photo_id: id, folder_id: folderId, user_id: session.user.id }));
    if (rows.length > 0) {
      const { error } = await supabase.from("photo_folder_items").insert(rows);
      if (error) {
        toast.error("追加に失敗しました");
        return;
      }
    }
    setBulkFolderOpen(false);
    toast.success(`${selected.length}件をフォルダへ追加しました`);
    setSelected([]);
    void load();
  };

  const changeView = (v: string) => {
    setView(v);
    setSelected([]);
  };

  const shown = useMemo(() => {
    let list = photos ?? [];
    if (view.startsWith("folder:")) {
      const fid = view.slice(7);
      const ids = new Set(items.filter((i) => i.folder_id === fid).map((i) => i.photo_id));
      list = list.filter((p) => ids.has(p.id));
    }
    if (filter === "checked") list = list.filter((p) => p.checked);
    if (filter === "unchecked") list = list.filter((p) => !p.checked);
    return list;
  }, [photos, items, view, filter]);

  const activeFolder = view.startsWith("folder:") ? folders.find((f) => f.id === view.slice(7)) : undefined;
  const FILTERS: { key: CheckFilter; label: string }[] = [
    { key: "all", label: "すべて" },
    { key: "checked", label: "確認済み" },
    { key: "unchecked", label: "未確認" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="写真" />
      <main className="mx-auto max-w-5xl px-4 pb-32 pt-4">
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
          onChange={(e) => {
            pick(e.target.files?.[0], true);
            e.target.value = "";
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0], false);
            e.target.value = "";
          }}
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant={view === "all" ? "default" : "outline"}
            size="sm"
            className={view === "all" ? "" : "bg-card"}
            onClick={() => changeView("all")}
          >
            全件
          </Button>
          {folders.map((f) => (
            <Button
              key={f.id}
              variant={view === `folder:${f.id}` ? "default" : "outline"}
              size="sm"
              className={view === `folder:${f.id}` ? "" : "bg-card"}
              onClick={() => changeView(`folder:${f.id}`)}
            >
              {f.name}
            </Button>
          ))}
          <Button variant="ghost" size="sm" aria-label="フォルダを追加" onClick={addFolder}>
            <FolderPlus className="size-5" />
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">確認状態</span>
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setFilter(f.key);
                setSelected([]);
              }}
            >
              {f.label}
            </Button>
          ))}
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
              <li
                key={p.id}
                className={`relative overflow-hidden rounded-xl border bg-card ${
                  selected.includes(p.id) ? "border-primary ring-2 ring-primary" : "border-border"
                }`}
              >
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
                <label className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-xs font-medium shadow">
                  <Checkbox
                    checked={selected.includes(p.id)}
                    onCheckedChange={(v) =>
                      setSelected((prev) => (v === true ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                    }
                  />
                  選択
                </label>
                {p.checked ? (
                  <span className="absolute bottom-14 right-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
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

      {/* 選択操作バー */}
      {selected.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{selected.length}件を選択中</span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" className="bg-card" onClick={() => setSelected([])}>
                解除
              </Button>
              <Button variant="outline" className="bg-card" onClick={() => setBulkFolderOpen(true)}>
                <FolderInput className="size-4" /> フォルダへ追加
              </Button>
              <Button variant="destructive" onClick={() => setConfirmBulkDelete(true)}>
                <Trash2 className="size-4" /> 削除
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
              {pending.fromCamera ? (
                <p className="text-xs text-muted-foreground">保存後は続けて撮影できるよう、カメラを再度開きます。</p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 一括フォルダ追加 */}
      <Dialog open={bulkFolderOpen} onOpenChange={setBulkFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>選択した{selected.length}件をフォルダへ追加</DialogTitle>
          </DialogHeader>
          {folders.length === 0 ? (
            <p className="text-sm text-muted-foreground">フォルダがありません。先に作成してください。</p>
          ) : (
            <div className="grid gap-2">
              {folders.map((f) => (
                <Button
                  key={f.id}
                  variant="outline"
                  className="h-12 justify-start bg-card"
                  onClick={() => void bulkAddToFolder(f.id)}
                >
                  {f.name}
                </Button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">写真は複製されません。「全件」からも消えません。</p>
        </DialogContent>
      </Dialog>

      {/* 一括削除の確認 */}
      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>選択した{selected.length}件を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              写真そのものが削除され、所属しているすべてのフォルダから表示されなくなります（ごみ箱へ移動します）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void bulkDelete();
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
