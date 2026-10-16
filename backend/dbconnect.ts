import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://cbojksaekjksptonwtmp.supabase.co"
const supabaseKey = "sb_publishable_E1metQXel63A9zRWCM8CSA_6owwQ3pH"

if (!supabaseUrl || !supabaseKey) {
	throw new Error(
		'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in backend/.env',
	)
}

export const dbconnect = createClient(supabaseUrl, supabaseKey)