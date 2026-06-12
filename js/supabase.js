import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://cpypuxvqyjlntzqwrerk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNweXB1eHZxeWpsbnR6cXdyZXJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NjA5MzMsImV4cCI6MjA5MzQzNjkzM30.S5pVuFWQ9aEEHbs6-GeXUYD6s_x3qHfLh1sBFCIfnq4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)