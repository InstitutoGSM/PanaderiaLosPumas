import { supabase } from './supabase.js'
import { toast, getIniciales } from './utils.js'
import { requireAdmin, logout } from './auth.js'

let todosVendedores = []
let filtroEstado = 'todos'
let vendedorSeleccionado = null

document.getElementById('btn-logout').addEventListener('click', logout)

document.getElementById('btn-cerrar-modal').addEventListener('click', () => {
  document.getElementById('modal-corregir').style.display = 'none'
  vendedorSeleccionado = null
})

document.getElementById('btn-enviar-correccion').addEventListener('click', async () => {
  const mensaje = document.getElementById('modal-mensaje').value.trim()
  if (!mensaje) { toast('Escribí un mensaje para el vendedor', 'err'); return }
  if (!vendedorSeleccionado) { toast('Error: no hay vendedor seleccionado', 'err'); return }

  const btn = document.getElementById('btn-enviar-correccion')
  btn.disabled = true; btn.textContent = 'Enviando...'

  const vendedor = todosVendedores.find(v => v.id === vendedorSeleccionado)

  const { error } = await supabase
    .from('profiles')
    .update({ estado_verificacion: 'sin_enviar', doc_notas_rechazo: mensaje })
    .eq('id', vendedorSeleccionado)

  if (error) {
    toast('Error al enviar corrección', 'err')
    btn.disabled = false; btn.textContent = '📧 Enviar email y notificar'
    return
  }

  const emailVendedor = vendedor?.email_contacto
  if (emailVendedor) {
    const asunto = encodeURIComponent('PanaderiaMarket — Corrección de documentos requerida')
    const cuerpo = encodeURIComponent(
      `Hola ${vendedor?.nombre_panaderia || vendedor?.nombre},\n\n` +
      `Revisamos tu documentación y encontramos lo siguiente:\n\n` +
      `${mensaje}\n\n` +
      `Por favor corregí los documentos e iniciá sesión en PanaderiaMarket ` +
      `para volver a subirlos desde "Mis Documentos".\n\n` +
      `Saludos,\nEquipo PanaderiaMarket`
    )
    window.open(`mailto:${emailVendedor}?subject=${asunto}&body=${cuerpo}`, '_blank')
  } else {
    toast('Este vendedor no tiene email de contacto registrado', 'inf')
  }

  btn.disabled = false; btn.textContent = '📧 Enviar email y notificar'
  document.getElementById('modal-corregir').style.display = 'none'
  toast('Corrección registrada ✏️', 'ok')
  actualizarLocal(vendedorSeleccionado, { estado_verificacion: 'sin_enviar', doc_notas_rechazo: mensaje })
  vendedorSeleccionado = null
})

async function init() {
  const session = await requireAdmin()
  if (!session) return
  await cargarVendedores()
  initFiltros()
  initRealtime()
}

async function cargarVendedores() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('tipo', 'vendedor')
    .order('created_at', { ascending: false })

  if (error) { toast('Error al cargar vendedores', 'err'); return }
  todosVendedores = data || []
  actualizarStats()
  renderVendedores()
}

function actualizarStats() {
  document.getElementById('st-pendientes').textContent =
    todosVendedores.filter(v => v.estado_verificacion === 'pendiente').length
  document.getElementById('st-aprobados').textContent =
    todosVendedores.filter(v => v.estado_verificacion === 'aprobado').length
  document.getElementById('st-rechazados').textContent =
    todosVendedores.filter(v => v.estado_verificacion === 'rechazado').length
  document.getElementById('st-sin-enviar').textContent =
    todosVendedores.filter(v => v.estado_verificacion === 'sin_enviar').length
}

function initFiltros() {
  document.querySelectorAll('.admin-filtros .filtro').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-filtros .filtro').forEach(b => b.classList.remove('on'))
      btn.classList.add('on')
      filtroEstado = btn.dataset.estado
      renderVendedores()
    })
  })
}

function renderVendedores() {
  const lista = filtroEstado === 'todos'
    ? todosVendedores
    : todosVendedores.filter(v => v.estado_verificacion === filtroEstado)

  const el = document.getElementById('lista-vendedores')
  const empty = document.getElementById('empty-vendedores')

  if (lista.length === 0) {
    el.innerHTML = ''; empty.style.display = 'block'; return
  }
  empty.style.display = 'none'

  el.innerHTML = lista.map(v => {
    const estado = v.estado_verificacion || 'sin_enviar'
    const nombreMost = v.nombre_panaderia || v.nombre || 'Sin nombre'
    const tieneDocs = v.doc_bromatologia || v.doc_carnet_manipulador || v.doc_habilitacion_comercial

    return `
      <div class="vendedor-card" data-id="${v.id}">
        <div class="vendedor-card-header">
          <div class="vendedor-avatar">
            ${v.avatar_url
              ? `<img src="${v.avatar_url}" alt="${nombreMost}">`
              : getIniciales(nombreMost)}
          </div>
          <div class="vendedor-info">
            <div class="vendedor-nombre">${nombreMost}</div>
            <div class="vendedor-email">${v.email_contacto || '—'}</div>
            <div class="vendedor-fecha">Registrado: ${new Date(v.created_at).toLocaleDateString('es-AR')}</div>
          </div>
          <span class="estado-badge-admin estado-${estado}">${estadoLabel(estado)}</span>
        </div>

        <div class="vendedor-docs">
          ${renderDoc(v.doc_bromatologia, '📋', 'Habilitación Bromatológica')}
          ${renderDoc(v.doc_carnet_manipulador, '🪪', 'Carnet Manipulador')}
          ${renderDoc(v.doc_habilitacion_comercial, '🏪', 'Habilitación Comercial')}
        </div>

        ${v.doc_notas_rechazo ? `
          <div style="margin:0 20px 14px;padding:10px 14px;
                      background:#FFF8E1;border-radius:var(--radio);
                      font-size:0.85rem;border-left:3px solid var(--naranja)">
            <strong>Último mensaje enviado:</strong><br>${v.doc_notas_rechazo}
          </div>` : ''}

        <div class="vendedor-acciones">
          ${estado !== 'aprobado' && tieneDocs ? `
            <button class="btn btn-sm" style="background:var(--verde);color:white"
                    data-action="aprobar" data-id="${v.id}">✅ Aprobar</button>` : ''}
          <button class="btn btn-ghost btn-sm"
                  data-action="corregir" data-id="${v.id}" data-nombre="${nombreMost}">
            ✏️ Solicitar corrección
          </button>
          <button class="btn btn-sm" style="background:#C62828;color:white"
                  data-action="rechazar" data-id="${v.id}">❌ Rechazar</button>
        </div>
      </div>
    `
  }).join('')

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { action, id, nombre = '' } = btn.dataset
      if (action === 'aprobar')  aprobar(id)
      if (action === 'rechazar') rechazar(id)
      if (action === 'corregir') abrirCorregir(id, nombre)
    })
  })
}

function renderDoc(url, ico, nombre) {
  if (!url) return `
    <div class="doc-item sin-doc">
      <span class="doc-ico">${ico}</span>
      <span class="doc-nombre">${nombre}</span>
      <span style="font-size:0.75rem;color:var(--gris)">No enviado</span>
    </div>`

  const esImagen = /\.(jpg|jpeg|png|webp|gif)$/i.test(url)
  return `
    <div class="doc-item">
      <span class="doc-ico">${ico}</span>
      <span class="doc-nombre">${nombre}</span>
      ${esImagen
        ? `<img src="${url}" alt="${nombre}" onclick="window.open('${url}','_blank')" title="Click para ver en tamaño completo">`
        : `<div style="font-size:0.78rem;color:var(--gris);margin-bottom:6px">Archivo PDF</div>`}
      <a href="${url}" target="_blank" class="ver-doc">🔍 Ver completo</a>
    </div>`
}

function estadoLabel(e) {
  return { sin_enviar: 'Sin documentos', pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' }[e] || e
}

async function aprobar(id) {
  if (!confirm('¿Aprobar este vendedor? Sus productos serán visibles en el catálogo.')) return
  const { error } = await supabase.from('profiles')
    .update({ estado_verificacion: 'aprobado', doc_notas_rechazo: null }).eq('id', id)
  if (error) { toast('Error al aprobar', 'err'); return }
  toast('Vendedor aprobado ✅', 'ok')
  actualizarLocal(id, { estado_verificacion: 'aprobado', doc_notas_rechazo: null })
}

async function rechazar(id) {
  if (!confirm('¿Rechazar este vendedor? No podrá publicar productos.')) return
  const { error } = await supabase.from('profiles')
    .update({ estado_verificacion: 'rechazado' }).eq('id', id)
  if (error) { toast('Error al rechazar', 'err'); return }
  toast('Vendedor rechazado ❌', 'ok')
  actualizarLocal(id, { estado_verificacion: 'rechazado' })
}

function abrirCorregir(id, nombre) {
  vendedorSeleccionado = id
  document.getElementById('modal-nombre-vendedor').textContent = nombre
  document.getElementById('modal-mensaje').value = ''
  document.getElementById('modal-corregir').style.display = 'flex'
}

function actualizarLocal(id, cambios) {
  const idx = todosVendedores.findIndex(v => v.id === id)
  if (idx >= 0) todosVendedores[idx] = { ...todosVendedores[idx], ...cambios }
  actualizarStats()
  renderVendedores()
}

function initRealtime() {
  supabase
    .channel('admin-vendedores')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `tipo=eq.vendedor` },
      () => cargarVendedores())
    .subscribe()
}

init()