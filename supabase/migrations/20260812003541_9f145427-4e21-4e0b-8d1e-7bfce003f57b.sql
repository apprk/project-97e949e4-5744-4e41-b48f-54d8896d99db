ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS checked boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.photo_folder_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES public.photo_folders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (photo_id, folder_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_folder_items TO authenticated;
GRANT ALL ON public.photo_folder_items TO service_role;

ALTER TABLE public.photo_folder_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "folder items own or admin" ON public.photo_folder_items
  FOR ALL TO authenticated
  USING ((user_id = auth.uid()) OR is_admin())
  WITH CHECK ((user_id = auth.uid()) OR is_admin());

CREATE INDEX IF NOT EXISTS photo_folder_items_folder_idx ON public.photo_folder_items(folder_id);
CREATE INDEX IF NOT EXISTS photo_folder_items_photo_idx ON public.photo_folder_items(photo_id);

INSERT INTO public.photo_folder_items (photo_id, folder_id, user_id)
SELECT p.id, p.folder_id, p.user_id
FROM public.photos p
WHERE p.folder_id IS NOT NULL
ON CONFLICT (photo_id, folder_id) DO NOTHING;