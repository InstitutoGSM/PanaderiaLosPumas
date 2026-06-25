import { debounce, formatPrecio, toast, catEmoji, catLabel, getIniciales } from './utils.js'
import { actualizarBadge, renderCarrito, agregarItem } from './carrito.js'
import { getUser, getPerfil } from './auth.js'
import { supabase } from './supabase.js'

// ══════════════════════════════════════════════════════
//  LOGICA DE PRODUCTOS
// ══════════════════════════════════════════════════════

let todos = []
let cat   = 'todos'
let busq  = ''

async function cargarPanaderiasFila() {
  const el = document.getElementById('panaderias-row')
  if (!el) return

  el.innerHTML = Array(3).fill(`
    <div class="skeleton" style="width:160px;height:52px;border-radius:50px"></div>
  `).join('')

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombre_panaderia, nombre, avatar_url')
    .eq('tipo', 'vendedor')
    .eq('estado_verificacion', 'aprobado')

  if (error || !data || data.length === 0) {
    el.innerHTML = '<p style="color:var(--gris);font-size:0.9rem">Aún no hay panaderías registradas</p>'
    return
  }

  el.innerHTML = data.map(p => `
    <a href="tienda.html?id=${p.id}" class="panaderia-chip">
      <div class="chip-avatar" style="${p.avatar_url
        ? `background:url('${p.avatar_url}') center/cover;color:transparent`
        : ''}">
        ${p.avatar_url ? '' : getIniciales(p.nombre_panaderia || p.nombre)}
      </div>
      <span class="chip-nombre">${p.nombre_panaderia || p.nombre}</span>
    </a>
  `).join('')
}

async function cargarProductos() {
  const grid = document.getElementById('productos-grid')
  if (grid) {
    grid.innerHTML = Array(8).fill(`
      <div class="skeleton" style="height:300px;border-radius:var(--radio-lg)"></div>
    `).join('')
  }

  const { data: vendAprobados } = await supabase
    .from('profiles')
    .select('id, nombre_panaderia, nombre, avatar_url')
    .eq('tipo', 'vendedor')
    .eq('estado_verificacion', 'aprobado')

  if (!vendAprobados || vendAprobados.length === 0) {
    todos = []
    if (grid) grid.innerHTML = ''
    renderProductos()
    return
  }

  const idsAprobados = vendAprobados.map(v => v.id)
  const mapaPerfiles = {}
  vendAprobados.forEach(v => { mapaPerfiles[v.id] = v })

  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('activo', true)
    .in('vendedor_id', idsAprobados)
    .order('created_at', { ascending: false })

  if (error) {
    if (grid) grid.innerHTML = ''
    return
  }

  todos = (data || []).map(p => ({
    ...p,
    nombre_panaderia: mapaPerfiles[p.vendedor_id]?.nombre_panaderia ||
      mapaPerfiles[p.vendedor_id]?.nombre || 'Panadería'
  }))

  const { data: cals } = await supabase
    .from('calificaciones')
    .select('producto_id, estrellas')

  if (cals) {
    const map = {}
    cals.forEach(c => {
      if (!map[c.producto_id]) map[c.producto_id] = []
      map[c.producto_id].push(c.estrellas)
    })
    todos = todos.map(p => ({
      ...p,
      promedio_cal: map[p.id]
        ? map[p.id].reduce((a, b) => a + b, 0) / map[p.id].length
        : 0
    }))
  }

  renderProductos()
}

function filtrar() {
  let lista = todos
  if (cat !== 'todos') lista = lista.filter(p => p.categoria === cat)
  if (busq.trim()) {
    const q = busq.toLowerCase()
    lista = lista.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      p.nombre_panaderia.toLowerCase().includes(q) ||
      (p.descripcion || '').toLowerCase().includes(q)
    )
  }
  const orden = document.getElementById('ordenar')?.value || 'reciente'
  if (orden === 'precio_asc')  lista = [...lista].sort((a, b) => a.precio - b.precio)
  if (orden === 'precio_desc') lista = [...lista].sort((a, b) => b.precio - a.precio)
  if (orden === 'nombre')      lista = [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre))
  if (orden === 'calificacion') lista = [...lista].sort((a, b) => (b.promedio_cal || 0) - (a.promedio_cal || 0))
  return lista
}

function renderProductos() {
  const grid  = document.getElementById('productos-grid')
  const empty = document.getElementById('empty-state')
  const count = document.getElementById('count')
  if (!grid) return

  const lista = filtrar()

  if (count) count.textContent = `${lista.length} producto${lista.length !== 1 ? 's' : ''}`

  if (lista.length === 0) {
    grid.innerHTML = ''
    if (empty) empty.style.display = 'block'
    return
  }
  if (empty) empty.style.display = 'none'

  grid.innerHTML = lista.map(p => {
    const sinStock = p.cantidad_disponible === 0
    return `
      <article class="card ${sinStock ? 'sin-stock' : ''}"
               data-id="${p.id}" tabindex="0"
               aria-label="${p.nombre}, ${formatPrecio(p.precio)}">
        <span class="card-cat badge badge-${p.categoria || 'otro'}">${catLabel(p.categoria)}</span>
        ${p.imagen_url
          ? `<img class="card-img" src="${p.imagen_url}" alt="${p.nombre}" loading="lazy">`
          : `<div class="card-img-ph">${catEmoji(p.categoria)}</div>`}
        <div class="card-body">
          <div class="card-nombre">${p.nombre}</div>
          <a href="tienda.html?id=${p.vendedor_id}" class="card-tienda"
             onclick="event.stopPropagation()">🏪 ${p.nombre_panaderia}</a>
          <div class="card-precio">
            ${p.unidad_venta === 'kilo' ? `${formatPrecio(p.precio)} / kg` : formatPrecio(p.precio)}
          </div>
          ${p.promedio_cal > 0 ? `
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:8px;font-size:0.8rem">
              <span style="color:#F0A500">★</span>
              <span style="font-weight:700">${p.promedio_cal.toFixed(1)}</span>
            </div>` : ''}
          ${p.dato_extra
            ? `<div style="font-size:0.78rem;color:var(--gris);margin-bottom:8px">ℹ️ ${p.dato_extra}</div>`
            : ''}
          <div style="display:flex;gap:8px;margin-top:8px">
            <a href="producto.html?id=${p.id}" class="btn btn-ghost btn-sm"
               onclick="event.stopPropagation()"
               aria-label="Ver ${p.nombre}"
               style="flex:1;justify-content:center">Ver</a>
            <button class="btn btn-naranja btn-sm btn-agregar"
                    data-id="${p.id}" style="flex:2"
                    ${sinStock ? 'disabled' : ''}>
              ${sinStock ? 'Sin stock' : '+ Agregar'}
            </button>
          </div>
        </div>
      </article>
    `
  }).join('')

  grid.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('button') || e.target.closest('a')) return
      window.location.href = `producto.html?id=${card.dataset.id}`
    })
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter') window.location.href = `producto.html?id=${card.dataset.id}`
    })
  })

  grid.querySelectorAll('.btn-agregar').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const prod = todos.find(p => p.id === btn.dataset.id)
      if (prod) { agregarItem(prod); toast(`${prod.nombre} agregado 🛒`, 'ok') }
    })
  })
}

function setCat(c) { cat = c; renderProductos() }
function setBusq(b) { busq = b; renderProductos() }

// ══════════════════════════════════════════════════════
//  CATALOGO (logica de pagina)
// ══════════════════════════════════════════════════════

actualizarBadge()
cargarProductos()
cargarPanaderias()
cargarPanaderiasFila()

getUser().then(async user => {
  const btn     = document.getElementById('nav-btn')
  const logoutB = document.getElementById('nav-logout')
  const histBtn = document.getElementById('nav-historial')
  if (!user) {
    btn.href = 'login.html'; btn.textContent = 'Ingresar'
    if (logoutB) logoutB.style.display = 'none'
    if (histBtn) histBtn.style.display = 'none'
    return
  }
  const perfil = await getPerfil(user.id)
  if (perfil?.tipo === 'vendedor') {
    btn.href = 'vendedor.html'; btn.textContent = 'Mi panel 📊'
  } else if (perfil?.tipo === 'admin') {
    btn.href = 'admin.html'; btn.textContent = 'Admin ⚙️'
  } else {
    btn.href = '#'
    btn.textContent = `Hola, ${perfil?.nombre?.split(' ')[0]} 👋`
  }
  if (logoutB) logoutB.style.display = 'inline-flex'
  if (histBtn) histBtn.style.display = 'inline-flex'
})

document.getElementById('nav-logout')?.addEventListener('click', e => {
  e.preventDefault()
  import('./auth.js').then(m => m.logout())
})

async function cargarPanaderias() {
  const { data } = await supabase
    .from('profiles')
    .select('id, nombre_panaderia, nombre, avatar_url')
    .eq('tipo', 'vendedor')
    .eq('estado_verificacion', 'aprobado')

  const el = document.getElementById('panaderias-list')
  if (!data || data.length === 0) {
    el.innerHTML = '<p style="font-size:0.82rem;color:var(--gris)">Sin panaderías aún</p>'
    return
  }

  el.innerHTML = `
    <a class="pan-chip on" data-id="todos" href="#">
      <div class="pan-chip-avatar" style="background:var(--marron)">🏪</div>
      Todas
    </a>
    ${data.map(p => `
      <a class="pan-chip" data-id="${p.id}"
         href="tienda.html?id=${p.id}"
         onclick="filtrarPorPanaderia(event, '${p.id}')">
        <div class="pan-chip-avatar" style="${p.avatar_url
          ? `background:url('${p.avatar_url}') center/cover;color:transparent`
          : ''}">
          ${p.avatar_url ? '' : (p.nombre_panaderia || p.nombre || '?')[0].toUpperCase()}
        </div>
        ${p.nombre_panaderia || p.nombre}
      </a>
    `).join('')}
  `

  el.querySelector('[data-id="todos"]').addEventListener('click', e => {
    e.preventDefault()
    el.querySelectorAll('.pan-chip').forEach(c => c.classList.remove('on'))
    e.currentTarget.classList.add('on')
    window._filtrarVendedor = null
    renderProductos()
  })
}

window.filtrarPorPanaderia = (e, id) => {
  e.preventDefault()
  const el = document.getElementById('panaderias-list')
  el.querySelectorAll('.pan-chip').forEach(c => c.classList.remove('on'))
  el.querySelector(`[data-id="${id}"]`)?.classList.add('on')
  window._filtrarVendedor = id
  renderProductos()
}

const onBusq = debounce(v => setBusq(v), 250)
document.getElementById('search-catalogo').addEventListener('input',
  e => onBusq(e.target.value))

function initSugerencias(inputId, getFn) {
  const input = document.getElementById(inputId)
  if (!input) return

  const drop = document.createElement('div')
  drop.className = 'sugerencias-drop'
  input.parentElement.style.position = 'relative'
  input.parentElement.appendChild(drop)

  const buscar = debounce(async q => {
    if (q.trim().length < 2) { drop.style.display = 'none'; return }
    const items = await getFn(q)
    if (!items || items.length === 0) { drop.style.display = 'none'; return }

    drop.innerHTML = items.map(item => `
      <a href="${item.href}" class="sug-item">
        <span class="sug-ico">${item.ico || '🔍'}</span>
        <div style="flex:1;min-width:0">
          <div class="sug-label">${item.label}</div>
          ${item.sub ? `<div class="sug-sub">${item.sub}</div>` : ''}
        </div>
        ${item.precio ? `<span class="sug-precio">${item.precio}</span>` : ''}
      </a>
    `).join('')

    drop.style.display = 'block'
  }, 220)

  input.addEventListener('input',  e => buscar(e.target.value))
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') drop.style.display = 'none'
  })
  document.addEventListener('click', e => {
    if (!input.parentElement.contains(e.target)) drop.style.display = 'none'
  })
}

initSugerencias('search-catalogo', async q => {
  const { data: prods } = await supabase
    .from('productos')
    .select('id,nombre,categoria,precio,unidad_venta')
    .ilike('nombre', `%${q}%`)
    .eq('activo', true)
    .limit(6)
  const emojis = { pan:'🍞', facturas:'🥐', galletas:'🍪', cakes:'🎂', otro:'✨' }
  return (prods || []).map(p => ({
    label: p.nombre, sub: p.categoria,
    ico: emojis[p.categoria] || '🛒',
    href: `producto.html?id=${p.id}`,
    precio: p.unidad_venta === 'kilo' ? `${formatPrecio(p.precio)}/kg` : formatPrecio(p.precio)
  }))
})

document.querySelectorAll('.filtro').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filtro').forEach(b => {
      b.classList.remove('on'); b.setAttribute('aria-pressed','false')
    })
    btn.classList.add('on'); btn.setAttribute('aria-pressed','true')
    setCat(btn.dataset.cat)
  })
})

document.getElementById('ordenar').addEventListener('change', renderProductos)

function toggleCart(abrir) {
  document.getElementById('cart-drawer').classList.toggle('open', abrir)
  document.getElementById('cart-overlay').classList.toggle('open', abrir)
  if (abrir) renderCarrito()
}
document.getElementById('cart-toggle').addEventListener('click',  () => toggleCart(true))
document.getElementById('cart-close').addEventListener('click',   () => toggleCart(false))
document.getElementById('cart-overlay').addEventListener('click', () => toggleCart(false))

document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
  document.getElementById('sidebar-pan').classList.toggle('open')
})

document.getElementById('search-panaderias').addEventListener('input',
  debounce(e => {
    const q = e.target.value.toLowerCase()
    document.querySelectorAll('#panaderias-list .pan-chip').forEach(chip => {
      chip.style.display = chip.textContent.toLowerCase().includes(q) ? 'flex' : 'none'
    })
  }, 200)
)

supabase
  .channel('catalogo-vendedores')
  .on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'profiles', filter: `tipo=eq.vendedor`
  }, payload => {
    if (payload.old.estado_verificacion !== payload.new.estado_verificacion) {
      cargarProductos()
      cargarPanaderias()
    }
  })
  .subscribe()