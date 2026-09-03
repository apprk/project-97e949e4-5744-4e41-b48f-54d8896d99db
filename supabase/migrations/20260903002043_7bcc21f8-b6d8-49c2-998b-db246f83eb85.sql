CREATE TABLE IF NOT EXISTS public.schedule_day_marks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mark_date date NOT NULL,
  gray boolean NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mark_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_day_marks TO authenticated;
GRANT ALL ON public.schedule_day_marks TO service_role;

ALTER TABLE public.schedule_day_marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "day marks own or admin" ON public.schedule_day_marks
FOR ALL TO authenticated
USING ((user_id = auth.uid()) OR is_admin())
WITH CHECK ((user_id = auth.uid()) OR is_admin());