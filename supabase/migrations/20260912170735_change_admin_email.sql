-- Update is_admin function to use the new email
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN 
    lower(auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR lower(auth.jwt() ->> 'email') = 'elproject.dev@gmail.com';
END;
$$;

-- Update can_access_owner function to use the new email
CREATE OR REPLACE FUNCTION public.can_access_owner(target_owner_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN 
    lower(auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR lower(auth.jwt() ->> 'email') = 'elproject.dev@gmail.com'
    OR (auth.uid() IS NOT NULL AND target_owner_id = auth.uid());
END;
$$;

-- Update the email in staff table
UPDATE public.staff 
SET email = 'elproject.dev@gmail.com' 
WHERE email = 'elproject.pos@gmail.com' AND role = 'admin';
