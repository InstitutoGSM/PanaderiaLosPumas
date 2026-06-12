import { supabase } from './supabase.js'

export async function subirImagen(file, userId, bucket = 'productos') {
  const ext    = file.name.split('.').pop()
  const nombre = `${userId}/${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from(bucket)
    .upload(nombre, file, { upsert: true })

  if (error) { console.error('Error subiendo imagen:', error); return null }

  const { data } = supabase.storage.from(bucket).getPublicUrl(nombre)
  return data.publicUrl
}