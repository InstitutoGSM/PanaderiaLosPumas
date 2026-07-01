import { supabase } from './supabase.js'
import {
  toast, formatPrecio,
  getIniciales
} from './utils.js'
import { requireAuth, logout } from './auth.js'
import { subirImagen } from './upload.js'

let uid = null
let perfil = null
let misProds = []
let fotosExtra = []

// -- Pedidos: estado de filtros --
let todosPedidosCache = []
let filtroPedidoEstado = 'todos'
let busqPedidos = ''

// -- Notificación de pedido nuevo --
const TITULO_ORIGINAL = document.title
let tituloFlashInterval = null

function reproducirSonidoPedido() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
  } catch (e) { /* navegador sin soporte de audio */ }
}

function iniciarFlashTitulo() {
  if (tituloFlashInterval) return
  let on = false
  tituloFlashInterval = setInterval(() => {
    document.title = on ? TITULO_ORIGINAL : '🛎️ ¡Nuevo pedido!'
    on = !on
  }, 1000)
}

function detenerFlashTitulo() {
  if (tituloFlashInterval) {
    clearInterval(tituloFlashInterval)
    tituloFlashInterval = null
  }
  document.title = TITULO_ORIGINAL
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) detenerFlashTitulo()
})

// ══ INIT ══
async function init() {
  const session = await requireAuth('vendedor')
  if (!session) return
  uid = session.user.id
  perfil = session.perfil

  document.getElementById('dash-sub').textContent =
    `Bienvenido/a, ${perfil.nombre.split(' ')[0]} 👋`

  cargarStats()
  cargarUltimos()
  cargarMisProductos()
  rellenarPerfil()
  initEventos()
  initRealtime()
  initDocumentos()
  initSucursales()
  const { count, error: countErr } = await supabase
    .from('productos')
    .select('id', { count: 'exact', head: true })
    .eq('vendedor_id', uid)
  if (!countErr && (count === 0 || count === null)) mostrarOnboarding()
}

// ══ ONBOARDING ══
function mostrarOnboarding() {
  const el = document.getElementById('onboarding')
  if (el) el.style.display = 'block'
}

// ══ REALTIME ══
function initRealtime() {
  supabase
    .channel('pedidos-vendedor')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'pedidos',
      filter: `vendedor_id=eq.${uid}`
    }, payload => {
      const ticketRef = payload.new.ticket_id ||
        '#' + payload.new.id.slice(-6).toUpperCase()
      toast(`🛎️ ¡Nuevo pedido recibido! ${ticketRef}`, 'ok')

      reproducirSonidoPedido()
      if (document.hidden) iniciarFlashTitulo()

      const badge = document.getElementById('badge-pedidos')
      if (badge) {
        const n = parseInt(badge.textContent || '0') + 1
        badge.textContent = n
        badge.style.display = 'flex'
      }
      cargarStats()
      if (document.getElementById('sec-pedidos').style.display !== 'none') {
        cargarPedidos()
      }
    })
    .subscribe()
}

// ══ NAVEGACIÓN ══
const TITULOS = {
  inicio: 'Mi Panel',
  productos: 'Mis Productos',
  agregar: 'Agregar Producto',
  pedidos: 'Pedidos',
  perfil: 'Mi Perfil',
  documentos: 'Mis Documentos',
  sucursales: 'Mis Sucursales'
}

function mostrarSec(nombre) {
  document.querySelectorAll('[id^="sec-"]').forEach(s => s.style.display = 'none')
  const sec = document.getElementById(`sec-${nombre}`)
  if (sec) sec.style.display = 'block'
  document.querySelectorAll('.nav-link').forEach(l =>
    l.classList.toggle('on', l.dataset.sec === nombre))
  document.getElementById('dash-titulo').textContent = TITULOS[nombre] || ''
  cerrarSidebar()
  if (nombre === 'pedidos') {
    cargarPedidos()
    const badge = document.getElementById('badge-pedidos')
    if (badge) badge.style.display = 'none'
  }
}

function cerrarSidebar() {
  document.getElementById('sidebar').classList.remove('open')
  document.getElementById('sidebar-overlay').classList.remove('open')
}

// ══ EVENTOS ══
function initEventos() {
  document.querySelectorAll('.nav-link').forEach(l =>
    l.addEventListener('click', e => { e.preventDefault(); mostrarSec(l.dataset.sec) }))

  document.getElementById('btn-ir-agregar').addEventListener('click', () =>
    mostrarSec('agregar'))

  document.getElementById('btn-logout').addEventListener('click', e => {
    e.preventDefault(); logout()
  })

  document.getElementById('mob-menu').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open')
    document.getElementById('sidebar-overlay').classList.add('open')
  })
  document.getElementById('sidebar-overlay').addEventListener('click', cerrarSidebar)

  // Imagen principal — archivo
  document.getElementById('p-img-file').addEventListener('change', e => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('Debe ser una imagen', 'err'); return }
    if (file.size > 5 * 1024 * 1024) { toast('Máx 5MB', 'err'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      const prev = document.getElementById('img-preview')
      prev.src = ev.target.result; prev.style.display = 'block'
    }
    reader.readAsDataURL(file)
    window._imgFile = file
    document.getElementById('p-img-url').value = ''
  })

  // Imagen principal — URL
  document.getElementById('p-img-url').addEventListener('input', e => {
    const url = e.target.value.trim()
    const prev = document.getElementById('img-preview')
    window._imgFile = null
    if (url) { prev.src = url; prev.style.display = 'block' }
    else prev.style.display = 'none'
  })

  // Fotos extra
  document.getElementById('p-fotos-extra').addEventListener('change', e => {
    const files = Array.from(e.target.files).slice(0, 4)
    fotosExtra = files
    const prev = document.getElementById('fotos-extra-preview')
    prev.innerHTML = ''
    files.forEach(f => {
      const reader = new FileReader()
      reader.onload = ev => {
        const img = document.createElement('img')
        img.src = ev.target.result
        img.style.cssText =
          'width:64px;height:64px;object-fit:cover;border-radius:8px;' +
          'border:2px solid var(--crema-dark)'
        prev.appendChild(img)
      }
      reader.readAsDataURL(f)
    })
  })

  // Avatar
  document.getElementById('pf-avatar-file').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast('Máx 2MB', 'err'); return }
    const reader = new FileReader()
    reader.onload = ev => {
      document.getElementById('avatar-preview').innerHTML =
        `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover">`
    }
    reader.readAsDataURL(file)
    toast('Subiendo foto...', 'inf')
    const url = await subirImagen(file, uid, 'avatares')
    if (!url) { toast('Error al subir foto', 'err'); return }
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', uid)
    toast('Foto actualizada ✓', 'ok')
  })

  document.getElementById('btn-guardar').addEventListener('click', guardarProducto)

  document.getElementById('btn-cancelar').addEventListener('click', () => {
    resetForm(); mostrarSec('productos')
  })

  document.getElementById('btn-guardar-perfil').addEventListener('click', guardarPerfil)

  // Toggle campos docena/kilo
  document.getElementById('p-unidad').addEventListener('change', e => {
    const esKilo = e.target.value === 'kilo'
    const campos = document.getElementById('campos-docena')
    const hint = document.getElementById('label-precio-hint')
    const labelEl = document.getElementById('label-precio-completo')
    const hintKilo = document.getElementById('hint-kilo')
    const inputP = document.getElementById('p-precio')
    if (campos) campos.style.display = esKilo ? 'none' : 'grid'
    if (hint) hint.textContent = esKilo ? '(precio por kg)' : '(por unidad)'
    if (labelEl) labelEl.textContent = esKilo ? 'Precio por KG *' : 'Precio *'
    if (hintKilo) hintKilo.style.display = esKilo ? 'block' : 'none'
    if (inputP) {
      inputP.placeholder = esKilo ? 'Ej: 2500 (= $2.500 x 1kg)' : '0'
      inputP.step = esKilo ? '100' : '50'
    }
  })

  document.getElementById('ob-ir-perfil')?.addEventListener('click', () =>
    mostrarSec('perfil'))
  document.getElementById('ob-ir-agregar')?.addEventListener('click', () =>
    mostrarSec('agregar'))
  document.getElementById('ob-cerrar')?.addEventListener('click', () => {
    document.getElementById('onboarding').style.display = 'none'
  })

    // Medios de pago — checkboxes
    ;['pf-pago-transferencia', 'pf-pago-debito', 'pf-pago-credito'].forEach(id => {
      const chk = document.getElementById(id)
      chk.addEventListener('change', () => {
        actualizarEstiloMedio(chk)
        if (id === 'pf-pago-transferencia') toggleTransferenciaDatos()
      })
    })

  // Filtros de pedidos
  document.querySelectorAll('#filtros-pedidos .filtro').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filtros-pedidos .filtro').forEach(b => b.classList.remove('on'))
      btn.classList.add('on')
      filtroPedidoEstado = btn.dataset.estado
      renderPedidosFiltrados()
    })
  })
  document.getElementById('buscar-pedidos').addEventListener('input', e => {
    busqPedidos = e.target.value
    renderPedidosFiltrados()
  })
}

// ══ STATS ══
async function cargarStats() {
  const { data: prods } = await supabase
    .from('productos').select('id, activo').eq('vendedor_id', uid)
  const activos = (prods || []).filter(p => p.activo).length
  document.getElementById('st-activos').textContent = activos
  document.getElementById('st-total').textContent = (prods || []).length

  const { data: peds } = await supabase
    .from('pedidos').select('id')
    .eq('vendedor_id', uid).eq('estado', 'pendiente')
  document.getElementById('st-pedidos').textContent = (peds || []).length
}

// ══ ÚLTIMOS PEDIDOS ══
async function cargarUltimos() {
  const { data } = await supabase
    .from('pedidos').select('*')
    .eq('vendedor_id', uid)
    .order('created_at', { ascending: false })
    .limit(5)

  const el = document.getElementById('ultimos-pedidos')
  if (!data || data.length === 0) {
    el.innerHTML = '<p style="color:var(--gris)">Aún no recibiste pedidos</p>'
    return
  }
  el.innerHTML = data.map(p => `
    <div style="display:flex;justify-content:space-between;align-items:center;
                padding:11px 0;border-bottom:1px solid var(--crema-dark)">
      <div>
        <div style="font-weight:700">
          ${p.ticket_id || '#' + p.id.slice(-6).toUpperCase()}
        </div>
        <div style="font-size:0.8rem;color:var(--gris)">
          ${new Date(p.created_at).toLocaleDateString('es-AR')}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700;color:var(--verde)">${formatPrecio(p.total)}</div>
        <span class="estado-badge estado-${p.estado}">${p.estado}</span>
      </div>
    </div>
  `).join('')
}

// ══ MIS PRODUCTOS ══
async function cargarMisProductos() {
  const { data } = await supabase
    .from('productos').select('*')
    .eq('vendedor_id', uid)
    .order('created_at', { ascending: false })
  misProds = data || []
  renderTabla()
}

function renderTabla() {
  const tbody = document.getElementById('tbody-productos')
  if (misProds.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="6"
            style="text-align:center;padding:36px;color:var(--gris)">
        No tenés productos todavía.
        <a href="#" onclick="event.preventDefault();
           document.querySelector('[data-sec=agregar]').click()"
           style="color:var(--naranja);font-weight:700">Agregá uno →</a>
      </td></tr>`
    return
  }

  tbody.innerHTML = misProds.map(p => `
    <tr data-id="${p.id}" ${!p.activo || p.cantidad_disponible === 0
      ? 'style="opacity:0.6"' : ''}>
      <td class="td-nombre">
        <div style="display:flex;align-items:center;gap:10px">
          ${p.imagen_url
      ? `<img src="${p.imagen_url}"
                    style="width:38px;height:38px;border-radius:6px;object-fit:cover">`
      : `<div style="width:38px;height:38px;border-radius:6px;
                           background:var(--crema-dark);display:flex;
                           align-items:center;justify-content:center;font-size:1.1rem">
                 ${catEmojiSimple(p.categoria)}
               </div>`}
          <div>
            <div>${p.nombre}</div>
            <div style="font-size:0.75rem;color:var(--gris)">
              ${p.unidad_venta === 'kilo' ? '⚖️ Por kilo' : '📦 Por unidad'}
              ${p.cantidad_disponible === 0
      ? ' · <span style="color:var(--rojo)">Sin stock</span>' : ''}
            </div>
          </div>
        </div>
      </td>
      <td>
        <span class="badge badge-${p.categoria || 'otro'}">
          ${p.categoria || 'otro'}
        </span>
      </td>
      <td class="td-precio">
        ${formatPrecio(p.precio)}
        <span style="font-size:0.72rem;color:var(--gris)">
          ${p.unidad_venta === 'kilo' ? '/kg' : '/u'}
        </span>
      </td>
      <td>${p.cantidad_disponible ?? '—'}</td>
      <td>
        <button class="toggle-estado ${p.activo ? 'activo' : 'inactivo'}"
                data-id="${p.id}" data-activo="${p.activo}">
          ${p.activo ? '✓ Activo' : '✗ Inactivo'}
        </button>
      </td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm btn-editar"
                  data-id="${p.id}" aria-label="Editar">✏️</button>
          <button class="btn btn-danger btn-sm btn-eliminar"
                  data-id="${p.id}" aria-label="Eliminar">🗑</button>
        </div>
      </td>
    </tr>
  `).join('')

  tbody.querySelectorAll('.toggle-estado').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nuevo = btn.dataset.activo === 'true' ? false : true
      const { error } = await supabase
        .from('productos').update({ activo: nuevo }).eq('id', btn.dataset.id)
      if (error) { toast('Error al actualizar', 'err'); return }
      btn.dataset.activo = nuevo
      btn.className = `toggle-estado ${nuevo ? 'activo' : 'inactivo'}`
      btn.textContent = nuevo ? '✓ Activo' : '✗ Inactivo'
      toast(nuevo ? 'Producto activado' : 'Producto desactivado', 'ok')
      cargarStats()
    })
  })

  tbody.querySelectorAll('.btn-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = misProds.find(x => x.id === btn.dataset.id)
      if (!p) return
      document.getElementById('edit-id').value = p.id
      document.getElementById('p-nombre').value = p.nombre
      document.getElementById('p-cat').value = p.categoria || ''
      document.getElementById('p-unidad').value = p.unidad_venta || 'unidad'
      document.getElementById('p-desc').value = p.descripcion || ''
      document.getElementById('p-precio').value = p.precio
      document.getElementById('p-media-doc').value = p.precio_media_docena || ''
      document.getElementById('p-docena').value = p.precio_docena || ''
      document.getElementById('p-stock').value = p.cantidad_disponible || 0
      document.getElementById('p-extra').value = p.dato_extra || ''
      document.getElementById('p-img-url').value = p.imagen_url || ''

      const campos = document.getElementById('campos-docena')
      if (campos) campos.style.display = p.unidad_venta === 'kilo' ? 'none' : 'grid'

      const prev = document.getElementById('img-preview')
      if (p.imagen_url) { prev.src = p.imagen_url; prev.style.display = 'block' }
      else prev.style.display = 'none'

      window._imgFile = null
      document.getElementById('form-titulo').textContent = '✏️ Editar Producto'
      document.getElementById('btn-cancelar').style.display = 'inline-flex'
      mostrarSec('agregar')
    })
  })

  tbody.querySelectorAll('.btn-eliminar').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este producto?')) return
      const { error } = await supabase
        .from('productos').delete().eq('id', btn.dataset.id)
      if (error) { toast('Error al eliminar', 'err'); return }
      misProds = misProds.filter(p => p.id !== btn.dataset.id)
      renderTabla(); cargarStats()
      toast('Producto eliminado', 'ok')
    })
  })
}

// ══ GUARDAR PRODUCTO ══
async function guardarProducto() {
  const editId = document.getElementById('edit-id').value
  const nombre = document.getElementById('p-nombre').value.trim()
  const cat = document.getElementById('p-cat').value
  const unidad = document.getElementById('p-unidad').value
  const precio = parseFloat(document.getElementById('p-precio').value)

  if (!nombre || !cat || !precio) {
    toast('Completá nombre, categoría y precio', 'err'); return
  }

  const btn = document.getElementById('btn-guardar')
  btn.disabled = true; btn.textContent = 'Guardando...'

  let imagenUrl = document.getElementById('p-img-url').value.trim() || null
  if (window._imgFile) {
    toast('Subiendo imagen...', 'inf')
    const url = await subirImagen(window._imgFile, uid)
    if (!url) {
      toast('Error al subir imagen', 'err')
      btn.disabled = false; btn.textContent = '💾 Guardar producto'
      return
    }
    imagenUrl = url
    window._imgFile = null
  }

  const payload = {
    vendedor_id: uid,
    nombre,
    categoria: cat,
    unidad_venta: unidad,
    descripcion: document.getElementById('p-desc').value.trim() || null,
    precio,
    precio_media_docena: unidad === 'kilo' ? null :
      parseFloat(document.getElementById('p-media-doc').value) || null,
    precio_docena: unidad === 'kilo' ? null :
      parseFloat(document.getElementById('p-docena').value) || null,
    cantidad_disponible: parseInt(document.getElementById('p-stock').value) || 0,
    dato_extra: document.getElementById('p-extra').value.trim() || null,
    imagen_url: imagenUrl,
  }

  let error
  let savedId = editId || null

  if (editId) {
    ; ({ error } = await supabase.from('productos').update(payload).eq('id', editId))
  } else {
    const { data: nuevo, error: err } = await supabase
      .from('productos').insert(payload).select().single()
    error = err
    savedId = nuevo?.id || null
  }

  btn.disabled = false; btn.textContent = '💾 Guardar producto'

  if (error) { toast('Error: ' + error.message, 'err'); return }

  if (fotosExtra.length > 0 && savedId) {
    for (let i = 0; i < fotosExtra.length; i++) {
      const url = await subirImagen(fotosExtra[i], uid)
      if (url) {
        await supabase.from('producto_fotos')
          .insert({ producto_id: savedId, url, orden: i })
      }
    }
    fotosExtra = []
    document.getElementById('fotos-extra-preview').innerHTML = ''
    document.getElementById('p-fotos-extra').value = ''
  }

  await supabase.from('profiles')
    .update({ es_nuevo_vendedor: false }).eq('id', uid)
  document.getElementById('onboarding').style.display = 'none'

  toast(editId ? 'Producto actualizado ✓' : '¡Producto publicado! 🎉', 'ok')
  resetForm()
  await cargarMisProductos()
  await cargarStats()
  mostrarSec('productos')
}

function resetForm() {
  ['edit-id', 'p-nombre', 'p-desc', 'p-precio', 'p-media-doc',
    'p-docena', 'p-stock', 'p-extra', 'p-img-url'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = ''
    })
  document.getElementById('p-cat').value = ''
  document.getElementById('p-unidad').value = 'unidad'
  document.getElementById('p-img-file').value = ''
  document.getElementById('img-preview').style.display = 'none'
  document.getElementById('form-titulo').textContent = '➕ Agregar Producto'
  document.getElementById('btn-cancelar').style.display = 'none'
  const campos = document.getElementById('campos-docena')
  if (campos) campos.style.display = 'grid'
  fotosExtra = []; window._imgFile = null
  document.getElementById('fotos-extra-preview').innerHTML = ''
  document.getElementById('p-fotos-extra').value = ''
}

// ══ PEDIDOS ══
async function cargarPedidos() {
  const { data } = await supabase
    .from('pedidos').select('*')
    .eq('vendedor_id', uid)
    .order('created_at', { ascending: false })

  todosPedidosCache = data || []
  renderPedidosFiltrados()
}

function renderPedidosFiltrados() {
  let lista = todosPedidosCache

  if (filtroPedidoEstado !== 'todos') {
    lista = lista.filter(p => p.estado === filtroPedidoEstado)
  }
  if (busqPedidos.trim()) {
    const q = busqPedidos.toLowerCase()
    lista = lista.filter(p =>
      (p.ticket_id || '').toLowerCase().includes(q) ||
      (p.nombre_comprador || '').toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    )
  }

  const el = document.getElementById('lista-pedidos')
  const empty = document.getElementById('empty-pedidos')

  if (todosPedidosCache.length === 0) {
    el.innerHTML = '<p style="color:var(--gris)">Aún no recibiste pedidos</p>'
    empty.style.display = 'none'
    return
  }

  if (lista.length === 0) {
    el.innerHTML = ''
    empty.style.display = 'block'
    return
  }
  empty.style.display = 'none'

  el.innerHTML = lista.map(p => `
    <div class="pedido-card">
      <div class="pedido-top">
        <div>
          <div class="pedido-id">
            ${p.ticket_id || '#' + p.id.slice(-6).toUpperCase()}
          </div>
          <div class="pedido-fecha">
            ${new Date(p.created_at).toLocaleString('es-AR')}
            ${p.nombre_comprador ? `· ${p.nombre_comprador}` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="estado-badge estado-${p.estado}">${p.estado}</span>
          <select onchange="window._cambiarEstado('${p.id}', this.value)"
                  style="width:auto;margin:0;font-size:0.82rem;padding:5px 10px">
            <option value="pendiente"  ${p.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
            <option value="confirmado" ${p.estado === 'confirmado' ? 'selected' : ''}>Confirmado</option>
            <option value="listo"      ${p.estado === 'listo' ? 'selected' : ''}>Listo</option>
            <option value="entregado"  ${p.estado === 'entregado' ? 'selected' : ''}>Entregado</option>
          </select>
        </div>
      </div>
      ${(p.items || []).map(i => `
        <div class="pedido-item">
          <span>${i.nombre} × ${i.cantidad}</span>
          <span style="font-weight:700">${formatPrecio(i.precio * i.cantidad)}</span>
        </div>
      `).join('')}
      <div class="pedido-total">
        <span>Total</span>
        <span>${formatPrecio(p.total)}</span>
      </div>
      ${p.notas ? `
        <div style="margin-top:10px;font-size:0.82rem;background:white;
                    padding:8px 12px;border-radius:6px">
          📝 ${p.notas}
        </div>` : ''}
    </div>
  `).join('')
}

window._cambiarEstado = async (id, estado) => {
  const { error } = await supabase.from('pedidos').update({ estado }).eq('id', id)
  if (error) { toast('Error al actualizar estado', 'err'); return }
  toast(`Estado actualizado: ${estado}`, 'ok')

  // Actualizar cache local sin recargar
  const idx = todosPedidosCache.findIndex(p => p.id === id)
  if (idx >= 0) todosPedidosCache[idx].estado = estado
  renderPedidosFiltrados()

  cargarStats()
}

// ══ PERFIL ══
function actualizarEstiloMedio(chk) {
  chk.closest('.medio-check')?.classList.toggle('on', chk.checked)
}

function toggleTransferenciaDatos() {
  const visible = document.getElementById('pf-pago-transferencia').checked
  document.getElementById('pf-transferencia-datos').style.display = visible ? 'block' : 'none'
}

function rellenarPerfil() {
  document.getElementById('pf-nombre').value = perfil.nombre || ''
  document.getElementById('pf-panaderia').value = perfil.nombre_panaderia || ''
  document.getElementById('pf-desc').value = perfil.descripcion || ''
  document.getElementById('pf-ig').value = perfil.instagram || ''
  document.getElementById('pf-tel').value = perfil.telefono || ''
  document.getElementById('pf-email').value = perfil.email_contacto || ''
  document.getElementById('pf-banner').value = perfil.banner_anuncio || ''
  document.getElementById('pf-direccion').value = perfil.direccion || ''

  const medios = Array.isArray(perfil.medios_pago) ? perfil.medios_pago : ['efectivo']
  const chkTransf = document.getElementById('pf-pago-transferencia')
  const chkDeb = document.getElementById('pf-pago-debito')
  const chkCred = document.getElementById('pf-pago-credito')
  chkTransf.checked = medios.includes('transferencia')
  chkDeb.checked = medios.includes('debito')
  chkCred.checked = medios.includes('credito')
    ;[chkTransf, chkDeb, chkCred].forEach(actualizarEstiloMedio)

  document.getElementById('pf-cbu').value = perfil.cbu || ''
  document.getElementById('pf-alias').value = perfil.alias_cbu || ''
  document.getElementById('pf-titular').value = perfil.titular_cuenta || ''

  toggleTransferenciaDatos()

  // Inicializar mapa del vendedor
  setTimeout(() => initMapaVendedor(), 100)

  const avatarEl = document.getElementById('avatar-preview')
  if (perfil.avatar_url) {
    avatarEl.innerHTML =
      `<img src="${perfil.avatar_url}" style="width:100%;height:100%;object-fit:cover">`
  } else {
    avatarEl.textContent = getIniciales(perfil.nombre_panaderia || perfil.nombre)
  }
}

async function guardarPerfil() {
  const btn = document.getElementById('btn-guardar-perfil')

  const medios = ['efectivo']
  if (document.getElementById('pf-pago-transferencia').checked) medios.push('transferencia')
  if (document.getElementById('pf-pago-debito').checked) medios.push('debito')
  if (document.getElementById('pf-pago-credito').checked) medios.push('credito')

  const cbu = document.getElementById('pf-cbu').value.trim()
  const alias = document.getElementById('pf-alias').value.trim()
  const titular = document.getElementById('pf-titular').value.trim()

  if (medios.includes('transferencia') && !cbu && !alias) {
    toast('Para aceptar transferencias ingresá al menos el CBU o el alias', 'err')
    return
  }

  btn.disabled = true; btn.textContent = 'Guardando...'

  const { error } = await supabase.from('profiles').update({
    nombre: document.getElementById('pf-nombre').value.trim(),
    nombre_panaderia: document.getElementById('pf-panaderia').value.trim(),
    descripcion: document.getElementById('pf-desc').value.trim(),
    instagram: document.getElementById('pf-ig').value.trim(),
    telefono: document.getElementById('pf-tel').value.trim(),
    email_contacto: document.getElementById('pf-email').value.trim(),
    banner_anuncio: document.getElementById('pf-banner').value.trim() || null,
    medios_pago: medios,
    cbu: cbu || null,
    alias_cbu: alias || null,
    titular_cuenta: titular || null,
    direccion: document.getElementById('pf-direccion').value.trim() || null,
    latitud: perfil._latTemp ?? perfil.latitud ?? null,
    longitud: perfil._lngTemp ?? perfil.longitud ?? null,
  }).eq('id', uid)

  btn.disabled = false; btn.textContent = 'Guardar cambios'
  if (error) { toast('Error al guardar', 'err'); return }

  perfil.medios_pago = medios
  perfil.cbu = cbu || null
  perfil.alias_cbu = alias || null
  perfil.titular_cuenta = titular || null

  perfil.direccion = document.getElementById('pf-direccion').value.trim() || null
  perfil.latitud = perfil._latTemp ?? perfil.latitud ?? null
  perfil.longitud = perfil._lngTemp ?? perfil.longitud ?? null
  delete perfil._latTemp
  delete perfil._lngTemp

  toast('Perfil actualizado ✓', 'ok')
}

function catEmojiSimple(c) {
  return { pan: '🍞', facturas: '🥐', galletas: '🍪', cakes: '🎂', otro: '✨' }[c] || '🛒'
}

// ══ DOCUMENTOS ══
let docsPendientes = { doc1: null, doc2: null, doc3: null }

export function initDocumentos() {
  cargarEstadoDocs()

    // Importar Archivos
    ;[
      { inputId: 'file-doc-1', key: 'doc1', previewId: 'preview-doc-1', icoId: 'ico-doc-1' },
      { inputId: 'file-doc-2', key: 'doc2', previewId: 'preview-doc-2', icoId: 'ico-doc-2' },
      { inputId: 'file-doc-3', key: 'doc3', previewId: 'preview-doc-3', icoId: 'ico-doc-3' },
    ].forEach(({ inputId, key, previewId, icoId }) => {
      document.getElementById(inputId)?.addEventListener('change', e => {
        const file = e.target.files[0]
        if (!file) return
        if (file.size > 5 * 1024 * 1024) { toast('Máx 5MB', 'err'); return }

        docsPendientes[key] = file

        const prev = document.getElementById(previewId)
        const ico = document.getElementById(icoId)
        if (ico) ico.textContent = '✅'

        if (file.type.startsWith('image/')) {
          const reader = new FileReader()
          reader.onload = ev => {
            prev.innerHTML = `
            <img src="${ev.target.result}"
                 style="width:100%;max-height:140px;object-fit:cover;
                        border-radius:8px;border:2px solid var(--crema-dark)">`
          }
          reader.readAsDataURL(file)
        } else {
          prev.innerHTML = `
          <div style="padding:10px;background:var(--crema);border-radius:8px;
                      font-size:0.82rem;color:var(--marron)">
            📄 ${file.name}
          </div>`
        }

        actualizarBtnEnviar()
      })
    })

  document.getElementById('btn-enviar-docs')?.addEventListener('click', enviarDocumentos)
}

async function cargarEstadoDocs() {
  const wrap = document.getElementById('doc-estado-wrap')
  if (!wrap) return

  const estado = perfil?.estado_verificacion || 'sin_enviar'
  const nota = perfil?.doc_notas_rechazo

  const configs = {
    sin_enviar: {
      ico: '📂', color: '#757575', bg: '#F5F5F5',
      titulo: 'Documentos no enviados',
      msg: 'Subí tus 3 documentos y enviálos para que podamos verificar tu panadería.'
    },
    pendiente: {
      ico: '🕐', color: '#F57F17', bg: '#FFF8E1',
      titulo: 'Documentos en revisión',
      msg: 'Recibimos tu documentación. Te notificaremos por email cuando esté lista la revisión.'
    },
    aprobado: {
      ico: '✅', color: '#2E7D32', bg: '#E8F5E9',
      titulo: '¡Panadería verificada!',
      msg: 'Tu documentación fue aprobada. Tus productos ya son visibles en el catálogo.'
    },
    rechazado: {
      ico: '❌', color: '#C62828', bg: '#FFEBEE',
      titulo: 'Documentación rechazada',
      msg: 'Tu documentación fue rechazada. Revisá el mensaje del administrador y volvé a subir los documentos.'
    },
  }

  const cfg = configs[estado] || configs['sin_enviar']

  wrap.innerHTML = `
    <div style="background:${cfg.bg};border-radius:var(--radio);
                padding:14px 18px;display:flex;gap:12px;align-items:flex-start">
      <span style="font-size:1.5rem;flex-shrink:0">${cfg.ico}</span>
      <div>
        <div style="font-weight:700;color:${cfg.color};margin-bottom:3px">
          ${cfg.titulo}
        </div>
        <div style="font-size:0.85rem;color:#444">${cfg.msg}</div>
        ${nota ? `
          <div style="margin-top:10px;padding:10px;background:white;
                      border-radius:6px;font-size:0.82rem;
                      border-left:3px solid var(--naranja)">
            <strong>Mensaje del administrador:</strong><br>${nota}
          </div>` : ''}
      </div>
    </div>
  `

  // Precargar docs ya subidos
  if (perfil?.doc_bromatologia) mostrarDocExistente('preview-doc-1', 'ico-doc-1', perfil.doc_bromatologia)
  if (perfil?.doc_carnet_manipulador) mostrarDocExistente('preview-doc-2', 'ico-doc-2', perfil.doc_carnet_manipulador)
  if (perfil?.doc_habilitacion_comercial) mostrarDocExistente('preview-doc-3', 'ico-doc-3', perfil.doc_habilitacion_comercial)

  // Mostrar punto naranja en sidebar si está pendiente
  const badge = document.getElementById('badge-docs')
  if (badge) badge.style.display = estado === 'sin_enviar' ? 'block' : 'none'

  // Deshabilitar subida si ya está aprobado
  if (estado === 'aprobado') {
    ;['file-doc-1', 'file-doc-2', 'file-doc-3'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.disabled = true
    })
    const btn = document.getElementById('btn-enviar-docs')
    if (btn) { btn.disabled = true; btn.textContent = '✅ Documentación aprobada' }
  }
}

function mostrarDocExistente(previewId, icoId, url) {
  const prev = document.getElementById(previewId)
  const ico = document.getElementById(icoId)
  if (ico) ico.textContent = '✅'
  if (!prev) return

  const esImagen = /\.(jpg|jpeg|png|webp|gif)$/i.test(url)
  if (esImagen) {
    prev.innerHTML = `
      <img src="${url}"
           style="width:100%;max-height:140px;object-fit:cover;
                  border-radius:8px;border:2px solid var(--crema-dark)">`
  } else {
    prev.innerHTML = `
      <a href="${url}" target="_blank"
         style="font-size:0.82rem;color:var(--naranja);font-weight:700">
        📄 Ver documento subido →
      </a>`
  }
}

function actualizarBtnEnviar() {
  const btn = document.getElementById('btn-enviar-docs')
  if (!btn) return
  const tieneTodo =
    (docsPendientes.doc1 || perfil?.doc_bromatologia) &&
    (docsPendientes.doc2 || perfil?.doc_carnet_manipulador) &&
    (docsPendientes.doc3 || perfil?.doc_habilitacion_comercial)
  btn.disabled = !tieneTodo
}

async function enviarDocumentos() {
  const btn = document.getElementById('btn-enviar-docs')
  btn.disabled = true; btn.textContent = 'Subiendo documentos...'

  const updates = {}

  try {
    if (docsPendientes.doc1) {
      const url = await subirImagen(docsPendientes.doc1, uid, 'documentos')
      if (!url) throw new Error('Error subiendo Habilitación Bromatológica')
      updates.doc_bromatologia = url
    }
    if (docsPendientes.doc2) {
      const url = await subirImagen(docsPendientes.doc2, uid, 'documentos')
      if (!url) throw new Error('Error subiendo Carnet de Manipulador')
      updates.doc_carnet_manipulador = url
    }
    if (docsPendientes.doc3) {
      const url = await subirImagen(docsPendientes.doc3, uid, 'documentos')
      if (!url) throw new Error('Error subiendo Habilitación Comercial')
      updates.doc_habilitacion_comercial = url
    }

    updates.estado_verificacion = 'pendiente'
    updates.doc_notas_rechazo = null

    const { error } = await supabase.from('profiles').update(updates).eq('id', uid)
    if (error) throw error

    // Actualizar perfil local
    Object.assign(perfil, updates)
    docsPendientes = { doc1: null, doc2: null, doc3: null }

    toast('¡Documentos enviados! Te avisaremos cuando sean revisados 📬', 'ok')
    cargarEstadoDocs()

  } catch (err) {
    toast(err.message || 'Error al subir documentos', 'err')
    btn.disabled = false; btn.textContent = '📤 Enviar documentos para revisión'
  }
}
//══════════════════════ TRABAJANDO ══════════════════════
// ══ SUCURSALES ══

async function initSucursales() {
  const content = document.getElementById('sucursales-content')
  if (!content) return

  // Si es sucursal, mostrar vista reducida
  if (perfil.es_sucursal && perfil.panaderia_padre_id) {
    const { data: padre } = await supabase
      .from('profiles')
      .select('nombre_panaderia, nombre, avatar_url')
      .eq('id', perfil.panaderia_padre_id)
      .single()

    const nombrePadre = padre?.nombre_panaderia || padre?.nombre || 'Panadería principal'
    content.innerHTML = `
      <div style="background:var(--crema);border-radius:var(--radio);
                  padding:16px 20px;margin-bottom:24px;
                  border-left:4px solid var(--naranja)">
        <strong>📍 Esta es una sucursal de:</strong> ${nombrePadre}
      </div>
      <p style="color:var(--gris);font-size:0.9rem">
        Las métricas de esta sucursal son visibles para la panadería principal.
      </p>
    `
    return
  }

  // Vista del PADRE
  content.innerHTML = `
    <!-- Stats consolidados -->
    <div class="stats-grid" id="stats-grupo" style="margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-label">Ventas totales del grupo</div>
        <div class="stat-value" id="sg-ventas">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pedidos del grupo</div>
        <div class="stat-value" id="sg-pedidos">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Productos del grupo</div>
        <div class="stat-value" id="sg-productos">—</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Sucursales activas</div>
        <div class="stat-value" id="sg-sucursales">—</div>
      </div>
    </div>

    <!-- Vincular sucursal -->
    <div class="sec-card" style="box-shadow:none;border:2px solid var(--crema-dark);
                                  margin-bottom:20px;padding:18px">
      <h3 style="margin-bottom:14px">➕ Agregar sucursal</h3>
      <div style="display:grid;grid-template-columns:1fr auto;gap:10px;margin-bottom:12px">
        <input type="email" id="input-buscar-sucursal"
               placeholder="Email de la panadería a vincular...">
        <button class="btn btn-ghost btn-sm" id="btn-buscar-sucursal">
          Buscar
        </button>
      </div>
      <div id="resultado-busqueda-sucursal"></div>

      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--crema-dark)">
        <p style="font-size:0.82rem;color:var(--gris);margin-bottom:10px">
          ¿O preferís crear una cuenta nueva para la sucursal?
        </p>
        <button class="btn btn-ghost btn-sm" id="btn-crear-sucursal">
          ✨ Crear nueva sucursal
        </button>
        <div id="form-crear-sucursal" style="display:none;margin-top:14px">
          <div class="form-row">
            <div class="field">
              <label>Nombre de la sucursal</label>
              <input type="text" id="suc-nombre-pan" placeholder="Ej: Panadería PUMA — Sucursal Norte">
            </div>
            <div class="field">
              <label>Nombre del responsable</label>
              <input type="text" id="suc-nombre" placeholder="Juan Pérez">
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Email</label>
              <input type="email" id="suc-email" placeholder="sucursal@email.com">
            </div>
            <div class="field">
              <label>Contraseña temporal</label>
              <input type="password" id="suc-pass" placeholder="Mínimo 8 caracteres">
            </div>
          </div>
          <button class="btn btn-naranja btn-sm" id="btn-confirmar-crear-sucursal">
            Crear sucursal
          </button>
        </div>
      </div>
    </div>

    <!-- Lista de sucursales -->
    <h3 style="margin-bottom:14px">Sucursales vinculadas</h3>
    <div id="lista-sucursales">
      <p style="color:var(--gris)">Cargando...</p>
    </div>
  `

  cargarMetricasGrupo()
  cargarListaSucursales()
  initEventosSucursales()
}

async function cargarMetricasGrupo() {
  // IDs del grupo: padre + todas las sucursales
  const { data: sucursales } = await supabase
    .from('profiles').select('id')
    .eq('panaderia_padre_id', uid)

  const ids = [uid, ...(sucursales || []).map(s => s.id)]

  const [
    { data: pedidos },
    { count: cProds }
  ] = await Promise.all([
    supabase.from('pedidos').select('total').in('vendedor_id', ids),
    supabase.from('productos').select('id', { count: 'exact', head: true })
      .in('vendedor_id', ids).eq('activo', true)
  ])

  const totalVentas = (pedidos || []).reduce((acc, p) => acc + (p.total || 0), 0)

  document.getElementById('sg-ventas').textContent = formatPrecio(totalVentas)
  document.getElementById('sg-pedidos').textContent = (pedidos || []).length
  document.getElementById('sg-productos').textContent = cProds || 0
  document.getElementById('sg-sucursales').textContent = (sucursales || []).length
}

async function cargarListaSucursales() {
  const { data } = await supabase
    .from('profiles').select('*')
    .eq('panaderia_padre_id', uid)

  const el = document.getElementById('lista-sucursales')
  if (!data || data.length === 0) {
    el.innerHTML = `
      <div style="text-align:center;padding:32px 0;color:var(--gris)">
        <div style="font-size:2.5rem;margin-bottom:10px">🏪</div>
        <p>Aún no tenés sucursales vinculadas</p>
      </div>`
    return
  }

  el.innerHTML = data.map(s => `
    <div class="sec-card" style="box-shadow:none;border:1px solid var(--crema-dark);
                                  margin-bottom:12px;padding:16px">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--naranja);
                    color:white;display:flex;align-items:center;justify-content:center;
                    font-weight:700;font-size:0.9rem;flex-shrink:0;overflow:hidden">
          ${s.avatar_url
      ? `<img src="${s.avatar_url}" style="width:100%;height:100%;object-fit:cover">`
      : getIniciales(s.nombre_panaderia || s.nombre)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700">${s.nombre_panaderia || s.nombre}</div>
          <div style="font-size:0.78rem;color:var(--gris)">${s.email_contacto || '—'}</div>
          <span class="estado-badge estado-${s.estado_verificacion || 'sin_enviar'}"
                style="font-size:0.7rem">
            ${s.estado_verificacion || 'sin_enviar'}
          </span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm"
                  onclick="verDetalleSucursal('${s.id}', '${s.nombre_panaderia || s.nombre}')">
            📊 Ver métricas
          </button>
          <button class="btn btn-sm" style="background:#C62828;color:white"
                  onclick="desvincularSucursal('${s.id}')">
            Desvincular
          </button>
        </div>
      </div>
      <!-- Panel métricas expandible -->
      <div id="detalle-suc-${s.id}" style="display:none;margin-top:14px;
           padding-top:14px;border-top:1px solid var(--crema-dark)">
      </div>
    </div>
  `).join('')
}

function initEventosSucursales() {
  // Buscar sucursal por email
  document.getElementById('btn-buscar-sucursal')?.addEventListener('click', async () => {
    const email = document.getElementById('input-buscar-sucursal').value.trim()
    if (!email) { toast('Ingresá un email', 'err'); return }

    const { data } = await supabase
      .from('profiles')
      .select('id, nombre_panaderia, nombre, avatar_url, es_sucursal, panaderia_padre_id')
      .eq('tipo', 'vendedor')
      .eq('email_contacto', email)
      .single()

    const el = document.getElementById('resultado-busqueda-sucursal')

    if (!data) {
      el.innerHTML = `<p style="color:var(--gris);font-size:0.85rem">
        No se encontró ninguna panadería con ese email.</p>`
      return
    }
    if (data.id === uid) {
      el.innerHTML = `<p style="color:#C62828;font-size:0.85rem">
        No podés vincularte a vos mismo.</p>`
      return
    }
    if (data.panaderia_padre_id) {
      el.innerHTML = `<p style="color:#C62828;font-size:0.85rem">
        Esta panadería ya está vinculada a otra panadería principal.</p>`
      return
    }

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;
                  background:var(--crema);padding:12px;border-radius:var(--radio)">
        <div style="font-weight:700">${data.nombre_panaderia || data.nombre}</div>
        <button class="btn btn-naranja btn-sm" style="margin-left:auto"
                id="btn-confirmar-vincular" data-id="${data.id}">
          Vincular como sucursal
        </button>
      </div>
    `

    document.getElementById('btn-confirmar-vincular').addEventListener('click', async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ panaderia_padre_id: uid, es_sucursal: true })
        .eq('id', data.id)

      if (error) { toast('Error al vincular', 'err'); return }
      toast('Sucursal vinculada ✓', 'ok')
      el.innerHTML = ''
      document.getElementById('input-buscar-sucursal').value = ''
      cargarListaSucursales()
      cargarMetricasGrupo()
    })
  })

  // Toggle form crear sucursal
  document.getElementById('btn-crear-sucursal')?.addEventListener('click', () => {
    const form = document.getElementById('form-crear-sucursal')
    form.style.display = form.style.display === 'none' ? 'block' : 'none'
  })

  // Crear sucursal nueva
  document.getElementById('btn-confirmar-crear-sucursal')?.addEventListener('click', async () => {
    const nombrePan = document.getElementById('suc-nombre-pan').value.trim()
    const nombre = document.getElementById('suc-nombre').value.trim()
    const email = document.getElementById('suc-email').value.trim()
    const pass = document.getElementById('suc-pass').value

    if (!nombrePan || !nombre || !email || !pass) {
      toast('Completá todos los campos', 'err'); return
    }
    if (pass.length < 8) { toast('Contraseña mínimo 8 caracteres', 'err'); return }

    const btn = document.getElementById('btn-confirmar-crear-sucursal')
    btn.disabled = true; btn.textContent = 'Creando...'

    const { data, error } = await supabase.auth.admin
      ? await supabase.auth.signUp({ email, password: pass })
      : await supabase.auth.signUp({ email, password: pass })

    if (error) {
      toast('Error al crear cuenta: ' + error.message, 'err')
      btn.disabled = false; btn.textContent = 'Crear sucursal'
      return
    }

    await supabase.from('profiles').insert({
      id: data.user.id,
      nombre,
      nombre_panaderia: nombrePan,
      tipo: 'vendedor',
      es_sucursal: true,
      panaderia_padre_id: uid,
      estado_verificacion: 'sin_enviar'
    })

    btn.disabled = false; btn.textContent = 'Crear sucursal'
    document.getElementById('form-crear-sucursal').style.display = 'none'
      ;['suc-nombre-pan', 'suc-nombre', 'suc-email', 'suc-pass'].forEach(id => {
        document.getElementById(id).value = ''
      })

    toast('¡Sucursal creada! 🎉', 'ok')
    cargarListaSucursales()
    cargarMetricasGrupo()
  })
}

// Ver métricas de una sucursal individual
window.verDetalleSucursal = async (sucId, nombre) => {
  const el = document.getElementById(`detalle-suc-${sucId}`)
  if (el.style.display !== 'none') { el.style.display = 'none'; return }

  el.innerHTML = '<p style="color:var(--gris)">Cargando métricas...</p>'
  el.style.display = 'block'

  const [
    { data: pedidos },
    { count: cProds },
    { data: ultimosPeds }
  ] = await Promise.all([
    supabase.from('pedidos').select('total, estado, created_at').eq('vendedor_id', sucId),
    supabase.from('productos').select('id', { count: 'exact', head: true })
      .eq('vendedor_id', sucId).eq('activo', true),
    supabase.from('pedidos').select('*').eq('vendedor_id', sucId)
      .order('created_at', { ascending: false }).limit(3)
  ])

  const totalVentas = (pedidos || []).reduce((acc, p) => acc + (p.total || 0), 0)
  const pendientes = (pedidos || []).filter(p => p.estado === 'pendiente').length
  const entregados = (pedidos || []).filter(p => p.estado === 'entregado').length

  el.innerHTML = `
    <h4 style="margin-bottom:12px;font-family:'Playfair Display',serif">
      📊 Métricas de ${nombre}
    </h4>
    <div class="stats-grid" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-label">Ventas totales</div>
        <div class="stat-value" style="font-size:1.4rem">${formatPrecio(totalVentas)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pedidos totales</div>
        <div class="stat-value" style="font-size:1.4rem">${(pedidos || []).length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Pendientes</div>
        <div class="stat-value" style="font-size:1.4rem;color:var(--naranja)">${pendientes}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Entregados</div>
        <div class="stat-value" style="font-size:1.4rem;color:var(--verde)">${entregados}</div>
      </div>
    </div>

    ${ultimosPeds && ultimosPeds.length > 0 ? `
      <div style="font-weight:700;margin-bottom:8px;font-size:0.88rem">Últimos pedidos:</div>
      ${ultimosPeds.map(p => `
        <div style="display:flex;justify-content:space-between;
                    padding:8px 0;border-bottom:1px solid var(--crema-dark);
                    font-size:0.82rem">
          <span>${p.ticket_id || '#' + p.id.slice(-6).toUpperCase()}</span>
          <span class="estado-badge estado-${p.estado}">${p.estado}</span>
          <span style="font-weight:700;color:var(--verde)">${formatPrecio(p.total)}</span>
        </div>
      `).join('')}
      <a href="tienda.html?id=${sucId}" target="_blank"
         class="btn btn-ghost btn-sm" style="margin-top:10px">
        Ver tienda de esta sucursal →
      </a>
    ` : '<p style="color:var(--gris);font-size:0.85rem">Sin pedidos aún</p>'}
  `
}

// Desvincular sucursal
window.desvincularSucursal = async (sucId) => {
  if (!confirm('¿Desvincular esta sucursal? Seguirá existiendo como panadería independiente.')) return
  const { error } = await supabase
    .from('profiles')
    .update({ panaderia_padre_id: null, es_sucursal: false })
    .eq('id', sucId)

  if (error) { toast('Error al desvincular', 'err'); return }
  toast('Sucursal desvinculada', 'ok')
  cargarListaSucursales()
  cargarMetricasGrupo()
}

// ══ MAPA ══
let mapaVendedor     = null
let marcadorVendedor = null

function initMapaVendedor() {
  const contenedor = document.getElementById('mapa-vendedor')
  if (!contenedor || typeof L === 'undefined') return

  if (mapaVendedor) { mapaVendedor.invalidateSize(); return }

  const latInicial = perfil.latitud  || -28.4696
  const lngInicial = perfil.longitud || -65.7795

  mapaVendedor = L.map('mapa-vendedor').setView([latInicial, lngInicial], perfil.latitud ? 15 : 13)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(mapaVendedor)

  marcadorVendedor = L.marker([latInicial, lngInicial], { draggable: true }).addTo(mapaVendedor)

  marcadorVendedor.on('dragend', () => {
    const pos = marcadorVendedor.getLatLng()
    perfil._latTemp = pos.lat
    perfil._lngTemp = pos.lng
  })

  mapaVendedor.on('click', e => {
    marcadorVendedor.setLatLng(e.latlng)
    perfil._latTemp = e.latlng.lat
    perfil._lngTemp = e.latlng.lng
  })

  document.querySelector('[data-sec="perfil"]')?.addEventListener('click', () => {
    setTimeout(() => mapaVendedor?.invalidateSize(), 200)
  })
}

document.getElementById('pf-direccion')?.addEventListener('blur', async () => {
  const direccion = document.getElementById('pf-direccion').value.trim()
  if (!direccion || direccion.length < 5) return

  try {
    const query = encodeURIComponent(direccion + ', Catamarca, Argentina')
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`)
    const data = await res.json()
    if (data && data[0]) {
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      if (mapaVendedor && marcadorVendedor) {
        mapaVendedor.setView([lat, lng], 16)
        marcadorVendedor.setLatLng([lat, lng])
        perfil._latTemp = lat
        perfil._lngTemp = lng
        toast('📍 Ubicación encontrada, ajustala si hace falta', 'ok')
      }
    }
  } catch (e) { /* el usuario puede ajustarlo manualmente */ }
})

init()