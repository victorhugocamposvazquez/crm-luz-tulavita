-- Enable RLS and add SELECT policies to allow listing and viewing commercials for second_commercial features
-- This migration grants authenticated users read access to basic profile info of coworkers in the same company,
-- and allows reading user_roles for commercials in the same company. Admins can read all.

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT profiles in their own company or if they are admin
CREATE POLICY profiles_select_same_company_or_admin_20250912
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR company_id = public.get_user_company(auth.uid())
);

-- USER_ROLES
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to SELECT commercial roles for users in their own company, or admins to read all
CREATE POLICY user_roles_select_same_company_or_admin_20250912
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (
    role = 'commercial'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.user_roles.user_id
        AND p.company_id = public.get_user_company(auth.uid())
    )
  )
);
