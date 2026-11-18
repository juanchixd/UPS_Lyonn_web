import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://wrxjmshztweghcjnxbrv.supabase.co'

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_tAKuWlKphB6ifPTfcHwZuw_aS5kNUlp'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
