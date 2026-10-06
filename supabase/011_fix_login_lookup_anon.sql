-- Restore the public username -> email lookup required before Supabase password auth.
-- The function is SECURITY DEFINER and only returns the email for a supplied username.
grant execute on function public.obter_email_por_username(text) to anon;
