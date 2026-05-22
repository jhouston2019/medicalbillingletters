import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function isAuthConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function resetPassword(email) {
  const redirectTo =
    typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}/login.html`
      : undefined;
  return supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
}

export async function signUp(email, password) {
  return supabase.auth.signUp({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}
