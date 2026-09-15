import { loadEnvFile } from 'node:process'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

loadEnvFile(join(__dirname, '.env'))

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
	throw new Error(
		'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in backend/.env',
	)
}

export const dbconnect = createClient(supabaseUrl, supabaseKey)