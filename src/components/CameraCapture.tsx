import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
};

/**
 * アプリ内カメラ。映像のそのままの解像度で撮影するため、
 * 切り抜きや余白なしでアスペクト比を維持して保存できる。
 */
export function CameraCapture({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        setError("カメラを使用できません。端末の許可設定をご確認ください。");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, facing]);

  const shoot = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    setBusy(false);
    if (!blob) return;
    onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-3 py-2 text-white">
        <span className="text-sm font-bold">撮影</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            aria-label="カメラ切替"
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          >
            <RefreshCw className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-12 text-white hover:bg-white/20"
            aria-label="閉じる"
            onClick={onClose}
          >
            <X className="size-8" />
          </Button>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <p className="px-6 text-center text-sm text-white">{error}</p>
        ) : (
          <video ref={videoRef} playsInline muted className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <div className="flex items-center justify-center pb-8 pt-4">
        <button
          type="button"
          aria-label="シャッター"
          disabled={busy || !!error}
          onClick={() => void shoot()}
          className="flex size-20 items-center justify-center rounded-full border-4 border-white bg-white/20 active:scale-95"
        >
          <Camera className="size-8 text-white" />
        </button>
      </div>
    </div>
  );
}
