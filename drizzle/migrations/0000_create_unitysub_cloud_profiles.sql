CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  date_of_birth text NOT NULL DEFAULT '',
  gender text NOT NULL DEFAULT '',
  nickname text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers read their own profile" ON public.profiles
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Customers create their own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Customers update their own profile" ON public.profiles
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TABLE public.app_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  dark_mode text CHECK (dark_mode IN ('on', 'off')),
  auto_logout varchar(32),
  login_fingerprint text CHECK (login_fingerprint IN ('on', 'off')),
  login_alerts text CHECK (login_alerts IN ('on', 'off')),
  transaction_alerts text CHECK (transaction_alerts IN ('on', 'off')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.app_preferences TO authenticated;
GRANT ALL ON public.app_preferences TO service_role;
ALTER TABLE public.app_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Customers read their own preferences" ON public.app_preferences
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Customers create their own preferences" ON public.app_preferences
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Customers update their own preferences" ON public.app_preferences
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id, display_name, address, state, date_of_birth, gender, nickname
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'display_name'), ''), 'UNITYSUB User'),
    COALESCE(NEW.raw_user_meta_data ->> 'address', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'state', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'date_of_birth', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'gender', ''),
    COALESCE(NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data ->> 'nickname'), ''), 'UNITYSUB User')
  ) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
CREATE TRIGGER unitysub_create_profile_after_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();