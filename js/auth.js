import { supabase } from './supabase.js'

export async function getUser() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user ?? null
}

export async function getPerfil(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return data
}

export async function logout() {
  await supabase.auth.signOut()
  window.location.href = 'login.html'
}

export async function requireAuth(redirigirSi = null) {
  const user = await getUser()
  if (!user) {
    window.location.href = 'login.html'
    return null
  }
  const perfil = await getPerfil(user.id)
  if (redirigirSi && perfil?.tipo !== redirigirSi) {
    window.location.href = 'index.html'
    return null
  }
  return { user, perfil }
}

// Devuelve user real o un objeto "invitado"
export async function getUsuarioOInvitado() {
  const user = await getUser()
  if (user) return user
  return { id: null, esInvitado: true }
}

// Verifica si hay sesión real, si no redirige a login con mensaje
export async function requireAuthParaComprar() {
  const user = await getUser()
  if (!user) {
    sessionStorage.setItem('redirect_after_login', location.href)
    sessionStorage.setItem('login_motivo', 'Para finalizar tu compra necesitás iniciar sesión o crear una cuenta 🛒')
    window.location.href = 'login.html'
    return null
  }
  return user
}