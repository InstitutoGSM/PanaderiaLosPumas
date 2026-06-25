import { supabase }              from './supabase.js'
import { toast, formatPrecio,
         getIniciales }          from './utils.js'
import { getUser, logout }       from './auth.js'
import { abrirTicket }           from './ticket.js'

document.getElementById('nav-logout').addEventListener('click', logout)

let currentUser = null

async function cargarPerfil(user) {
  const { data: p } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  const nombreMostrar = p?.nombre || user.email?.split('@')[0] || 'Mi cuenta'
  const wrap = document.getElementById('perfil-wrap')

  wrap.innerHTML = `
    <div class="perfil-avatar" id="hist-avatar">
      ${p?.avatar_url
        ? `<img src="${p.avatar_url}" alt="Foto de perfil">`
        : getIniciales(nombreMostrar)}
    </div>
    <div class="perfil-info">
      <div class="perfil-nombre">${nombreMostrar}</div>
      <div class="perfil-email">${user.email}</div>
      <div class="perfil-acciones">
        <button class="btn btn-ghost btn-sm" id="btn-editar-perfil">
          ✏️ Editar perfil
        </button>
        <label for="hist-avatar-file" class="btn btn-ghost btn-sm" style="cursor:pointer">
          📷 Cambiar foto
        </label>
        <input type="file" id="hist-avatar-file" accept="image/*" style="display:none">
      </div>
      <div class="edit-perfil-form" id="edit-perfil-form">
        <div class="field" style="margin-bottom:12px">
          <label for="hist-nombre">Nombre completo</label>
          <input type="text" id="hist-nombre"
                 value="${p?.nombre || ''}" placeholder="Tu nombre">
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-marron btn-sm" id="btn-guardar-perfil">Guardar</button>
          <button class="btn btn-ghost btn-sm"  id="btn-cancelar-perfil">Cancelar</button>
        </div>
      </div>
    </div>
  `

  document.getElementById('btn-editar-perfil').addEventListener('click', () => {
    document.getElementById('edit-perfil-form').classList.toggle('open')
  })
  document.getElementById('btn-cancelar-perfil').addEventListener('click', () => {
    document.getElementById('edit-perfil-form').classList.remove('open')
  })
  document.getElementById('btn-guardar-perfil').addEventListener('click', async () => {
    const nombre = document.getElementById('hist-nombre').value.trim()
    if (!nombre) return
    const { error } = await supabase.from('profiles').update({ nombre }).eq('id', user.id)
    if (error) { toast('Error al guardar', 'err'); return }
    toast('Perfil actualizado ✓', 'ok')
    document.querySelector('.perfil-nombre').textContent = nombre
    document.getElementById('edit-perfil-form').classList.remove('open')
  })

  document.getElementById('hist-avatar-file').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast('Máx 2MB', 'err'); return }
    toast('Subiendo foto...', 'inf')
    const { subirImagen } = await import('./upload.js')
    const url = await subirImagen(file, user.id, 'avatares')
    if (!url) { toast('Error al subir foto', 'err'); return }
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
    document.getElementById('hist-avatar').innerHTML =
      `<img src="${url}" alt="Foto de perfil">`
    toast('Foto actualizada ✓', 'ok')
  })
}

// --func cargarPredidos--
async function cargarPedidos(user) {
  const { data, error } = await supabase
    .from('pedidos').select('*')
    .eq('comprador_id', user.id)
    .order('created_at', { ascending: false })

  const el    = document.getElementById('lista-historial')
  const empty = document.getElementById('empty-historial')

  if (error) { el.innerHTML = '<p style="color:var(--gris)">Error al cargar pedidos</p>'; return }
  if (!data || data.length === 0) { el.innerHTML = ''; empty.style.display = 'block'; return }

  el.innerHTML = data.map(p => `
    <div class="historial-card" data-pedido-id="${p.id}">
      <div class="historial-top">
        <div>
          <div class="historial-ticket">
            ${p.ticket_id || '#' + p.id.slice(-8).toUpperCase()}
          </div>
          <div class="historial-fecha">
            ${new Date(p.created_at).toLocaleString('es-AR')}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="estado-badge estado-${p.estado}">${p.estado}</span>
          <strong style="color:var(--verde);font-size:1.1rem">
            ${formatPrecio(p.total)}
          </strong>
        </div>
      </div>
      <div class="historial-items">
        ${(p.items || []).map(i => `
          <div class="historial-item">
            <span>${i.nombre} × ${i.cantidad}</span>
            <span style="font-weight:700">${formatPrecio(i.precio * i.cantidad)}</span>
          </div>
        `).join('')}
      </div>
      <div class="historial-footer">
        <div style="font-size:0.82rem;color:var(--gris)">
          Pago: ${p.medio_pago || '—'}
          ${p.direccion ? `· ${p.direccion}` : ''}
        </div>
        <button class="btn btn-ghost btn-sm btn-ticket" data-id="${p.id}">
          🎫 Ver ticket
        </button>
      </div>
    </div>
  `).join('')

  el.querySelectorAll('.btn-ticket').forEach(btn => {
    btn.addEventListener('click', () => {
      const pedido = data.find(p => p.id === btn.dataset.id)
      if (pedido) abrirTicket(pedido)
    })
  })
}

function initRealtime(user) {
  supabase
    .channel('historial-comprador')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'pedidos',
      filter: `comprador_id=eq.${user.id}`
    }, payload => {
      const card  = document.querySelector(`[data-pedido-id="${payload.new.id}"]`)
      const badge = card?.querySelector('.estado-badge')
      if (badge) {
        badge.className   = `estado-badge estado-${payload.new.estado}`
        badge.textContent = payload.new.estado
        toast(`Tu pedido cambió a: ${payload.new.estado} 📦`, 'ok')
      } else {
        cargarPedidos(user)
      }
    })
    .subscribe()
}

async function init() {
  currentUser = await getUser()
  if (!currentUser) { location.href = 'login.html'; return }
  await cargarPerfil(currentUser)
  await cargarPedidos(currentUser)
  initRealtime(currentUser)
}

init()