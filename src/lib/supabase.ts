import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.warn('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(
    supabaseUrl,
    supabaseAnonKey
)

export const getSupabaseAdmin = () => {
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase Service Role Key')
    }
    return createClient<Database>(supabaseUrl, supabaseServiceKey)
}
