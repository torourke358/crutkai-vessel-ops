// Strip ALL whitespace from a config value. A long key pasted into an env
// dashboard (Vercel, etc.) can pick up stray spaces or newlines — even in the
// middle of the string — which make fetch reject the auth header as an
// "Invalid value". Supabase URLs/keys and API keys never contain whitespace,
// so removing it all is safe and robust against bad pastes.
export const cleanEnv = (v: string | undefined): string =>
  (v ?? "").replace(/\s/g, "");
