import { supabase } from './supabase.js'
import { toast } from './utils.js'

// ── Mostrar motivo si viene de intento de compra ──
window.addEventListener('DOMContentLoaded', () => {
  const motivo = sessionStorage.getItem('login_motivo')
  if (motivo) {
    toast(motivo, 'inf')
    sessionStorage.removeItem('login_motivo')
  }
})

// ── Tabs ──
const tabs = document.querySelectorAll('.tab')
const panels = document.querySelectorAll('.panel')

function switchTab(nombre) {
  tabs.forEach(t => {
    t.classList.toggle('on', t.dataset.tab === nombre)
    t.setAttribute('aria-selected', t.dataset.tab === nombre)
  })
  panels.forEach(p => p.classList.toggle('on', p.id === `panel-${nombre}`))
}

tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)))
document.getElementById('ir-registro')?.addEventListener('click', () => switchTab('registro'))
document.getElementById('ir-login')?.addEventListener('click', () => switchTab('login'))

// ── Recuperar contraseña (panel especial, fuera de los tabs) ──
function mostrarPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('on'))
  document.getElementById(id).classList.add('on')
}

document.getElementById('ir-recuperar')?.addEventListener('click', () => {
  mostrarPanel('panel-recuperar')
})
document.getElementById('ir-login-from-recuperar')?.addEventListener('click', () => {
  switchTab('login')
})

document.getElementById('btn-recuperar')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-recuperar')
  const email = document.getElementById('rec-email').value.trim()
  if (!email) { toast('Ingresá tu email', 'err'); return }

  btn.disabled = true; btn.textContent = 'Enviando...'

  const redirectTo = location.href.replace(/login\.html.*$/, 'reset-password.html')
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  btn.disabled = false; btn.textContent = 'Enviar link de recuperación'

  if (error) { toast('Error: ' + error.message, 'err'); return }
  toast('Si el email existe, te enviamos un link de recuperación 📧', 'ok')
})

// ── Tipo de usuario ──
let tipoSel = 'comprador'
document.querySelectorAll('.tipo-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.tipo-opt').forEach(o => {
      o.classList.remove('on')
      o.setAttribute('aria-checked', 'false')
    })
    opt.classList.add('on')
    opt.setAttribute('aria-checked', 'true')
    tipoSel = opt.dataset.tipo
    const campo = document.getElementById('campo-panaderia')
    if (campo) campo.style.display = tipoSel === 'vendedor' ? 'block' : 'none'
    const aviso = document.getElementById('aviso-vendedor')
    if (aviso) aviso.style.display = tipoSel === 'vendedor' ? 'block' : 'none'
  })
  opt.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') opt.click() })
})

// ── Fuerza contraseña ──
document.getElementById('r-pass')?.addEventListener('input', e => {
  const v = e.target.value
  const bar = document.getElementById('pass-bar')
  const lbl = document.getElementById('pass-label')
  if (!bar || !lbl) return
  let nivel = 0
  if (v.length >= 8) nivel++
  if (/[A-Z]/.test(v)) nivel++
  if (/[0-9]/.test(v)) nivel++
  if (/[^A-Za-z0-9]/.test(v)) nivel++
  const colores = ['', '#C0392B', '#E07830', '#2D7A4F', '#1A5C38']
  const labels = ['', 'Débil', 'Regular', 'Fuerte', 'Muy fuerte']
  bar.style.width = `${nivel * 25}%`
  bar.style.background = colores[nivel] || ''
  lbl.textContent = v ? labels[nivel] : ''
  lbl.style.color = colores[nivel] || ''
})

// ── Redirect post-login ──
function redirigirPostLogin(perfil) {
  const destino = sessionStorage.getItem('redirect_after_login')
  sessionStorage.removeItem('redirect_after_login')
  if (destino) {
    window.location.href = destino
  } else if (perfil?.tipo === 'vendedor') {
    window.location.href = 'vendedor.html'
  } else if (perfil?.tipo === 'admin') {
    window.location.href = 'admin.html'
  } else {
    window.location.href = 'catalogo.html'
  }
}

// ── Login ──
document.getElementById('btn-login')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-login')
  const email = document.getElementById('l-email').value.trim()
  const pass = document.getElementById('l-pass').value
  if (!email || !pass) { toast('Completá email y contraseña', 'err'); return }
  btn.disabled = true; btn.textContent = 'Ingresando...'
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })
  if (error) {
    toast('Email o contraseña incorrectos', 'err')
    btn.disabled = false; btn.textContent = 'Iniciar Sesión'
    return
  }
  const { data: perfil } = await supabase
    .from('profiles').select('tipo').eq('id', data.user.id).single()
  toast('¡Bienvenido/a! 🥖', 'ok')
  setTimeout(() => redirigirPostLogin(perfil), 700)
})

// ── Registro ──
document.getElementById('btn-registro')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-registro')
  const nombre = document.getElementById('r-nombre').value.trim()
  const email = document.getElementById('r-email').value.trim()
  const pass = document.getElementById('r-pass').value
  const panaderia = document.getElementById('r-panaderia')?.value.trim()

  if (!nombre || !email || !pass) { toast('Completá todos los campos', 'err'); return }
  if (pass.length < 8) { toast('La contraseña necesita al menos 8 caracteres', 'err'); return }
  if (tipoSel === 'vendedor' && !panaderia) { toast('Ingresá el nombre de tu panadería', 'err'); return }

  btn.disabled = true; btn.textContent = 'Creando cuenta...'

  const { data, error } = await supabase.auth.signUp({ email, password: pass })
  if (error) {
    toast(error.message, 'err')
    btn.disabled = false; btn.textContent = 'Registrarse'
    return
  }

  await supabase.from('profiles').insert({
    id: data.user.id,
    nombre,
    tipo: tipoSel,
    nombre_panaderia: tipoSel === 'vendedor' ? panaderia : null
  })

  toast('¡Cuenta creada! 🎉', 'ok')
  setTimeout(() => redirigirPostLogin({ tipo: tipoSel }), 700)
})

// ── Enter para enviar ──
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return
  if (document.getElementById('panel-login').classList.contains('on')) {
    document.getElementById('btn-login').click()
  } else if (document.getElementById('panel-registro').classList.contains('on')) {
    document.getElementById('btn-registro').click()
  } else if (document.getElementById('panel-recuperar').classList.contains('on')) {
    document.getElementById('btn-recuperar').click()
  }
})