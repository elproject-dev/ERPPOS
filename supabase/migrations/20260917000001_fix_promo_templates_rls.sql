-- Fix RLS policies for promo_templates and promo_sent_logs
ALTER TABLE public.promo_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.promo_templates;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.promo_templates;
DROP POLICY IF EXISTS "Enable update for all users" ON public.promo_templates;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.promo_templates;

CREATE POLICY "Enable read access for all users" ON public.promo_templates FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.promo_templates FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.promo_templates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete for all users" ON public.promo_templates FOR DELETE USING (true);

-- Ensure update policy exists for promo_sent_logs
DROP POLICY IF EXISTS "Enable update for all users" ON public.promo_sent_logs;
CREATE POLICY "Enable update for all users" ON public.promo_sent_logs FOR UPDATE USING (true) WITH CHECK (true);
