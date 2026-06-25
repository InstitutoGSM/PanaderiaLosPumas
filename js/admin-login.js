import { supabase } from './supabase.js'
import { toast }    from './utils.js'

// Si ya hay sesión admin activa, redirigir directo
const { data: sessionData } = await supabase.auth.getSession()
if (sessionData.session) {
  const { data: perfil } = await supabase
    .from('profiles')
    .select('tipo')
    .eq('id', sessionData.session.user.id)
    .single()
  if (perfil?.tipo === 'admin') location.href = 'admin.html'
}

// Login
document.getElementById('btn-admin-login').addEventListener('click', async () => {
  const btn   = document.getElementById('btn-admin-login')
  const email = document.getElementById('a-email').value.trim()
  const pass  = document.getElementById('a-pass').value

  if (!email || !pass) { toast('Completá los campos', 'err'); return }

  btn.disabled = true; btn.textContent = 'Verificando...'

  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })

  if (error) {
    toast('Credenciales incorrectas', 'err')
    btn.disabled = false; btn.textContent = 'Ingresar'
    return
  }

  const { data: perfil } = await supabase
    .from('profiles').select('tipo').eq('id', data.user.id).single()

  if (perfil?.tipo !== 'admin') {
    await supabase.auth.signOut()
    toast('No tenés permisos de administrador', 'err')
    btn.disabled = false; btn.textContent = 'Ingresar'
    return
  }

  location.href = 'admin.html'
})

// Enter para enviar
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-admin-login').click()
})