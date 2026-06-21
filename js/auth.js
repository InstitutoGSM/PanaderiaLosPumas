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
  window.location.href = 'catalogo.html'
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

export async function requireAdmin() {
  const user = await getUser()
  if (!user) {
    window.location.href = 'admin-login.html'
    return null
  }
  const perfil = await getPerfil(user.id)
  if (perfil?.tipo !== 'admin') {
    window.location.href = 'index.html'
    return null
  }
  return { user, perfil }
}

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