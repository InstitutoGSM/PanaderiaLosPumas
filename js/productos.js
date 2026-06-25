import { supabase } from './supabase.js'
import {
  toast, formatPrecio, catEmoji,
  catLabel, getIniciales
} from './utils.js'
import { agregarItem, actualizarBadge } from './carrito.js'

let todos = []
let cat = 'todos'
let busq = ''

// -- Cargar panaderías --
export async function cargarPanaderias() {
  const el = document.getElementById('panaderias-row')
  if (!el) return

  el.innerHTML = Array(3).fill(`
    <div class="skeleton" style="width:160px;height:52px;border-radius:50px"></div>
  `).join('')

  const { data, error } = await supabase
    .from('profiles')
    .select('id, nombre_panaderia, nombre, avatar_url')
    .eq('tipo', 'vendedor')
    .eq('estado_verificacion', 'aprobado')  // solo aprobados

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

// -- Cargar productos --
export async function cargarProductos() {
  const grid = document.getElementById('productos-grid')
  if (grid) {
    grid.innerHTML = Array(8).fill(`
      <div class="skeleton" style="height:300px;border-radius:var(--radio-lg)"></div>
    `).join('')
  }

  // Primero obtenemos los IDs de vendedores aprobados
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

  // Luego traemos solo productos de esos vendedores
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('activo', true)
    .in('vendedor_id', idsAprobados)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error cargando productos:', error)
    if (grid) grid.innerHTML = ''
    return
  }

  todos = (data || []).map(p => ({
    ...p,
    nombre_panaderia: mapaPerfiles[p.vendedor_id]?.nombre_panaderia ||
      mapaPerfiles[p.vendedor_id]?.nombre || 'Panadería'
  }))

  // Calificaciones
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

// -- Filtrar --
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
  if (orden === 'precio_asc') lista = [...lista].sort((a, b) => a.precio - b.precio)
  if (orden === 'precio_desc') lista = [...lista].sort((a, b) => b.precio - a.precio)
  if (orden === 'nombre') lista = [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre))
  if (orden === 'calificacion') lista = [...lista].sort((a, b) => (b.promedio_cal || 0) - (a.promedio_cal || 0))
  return lista
}

// -- Render grid --
export function renderProductos() {
  const grid = document.getElementById('productos-grid')
  const empty = document.getElementById('empty-state')
  const count = document.getElementById('count')
  if (!grid) return

  const lista = filtrar()

  if (count) count.textContent =
    `${lista.length} producto${lista.length !== 1 ? 's' : ''}`

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
        <span class="card-cat badge badge-${p.categoria || 'otro'}">
          ${catLabel(p.categoria)}
        </span>
        ${p.imagen_url
        ? `<img class="card-img" src="${p.imagen_url}"
                  alt="${p.nombre}" loading="lazy">`
        : `<div class="card-img-ph">${catEmoji(p.categoria)}</div>`}
        <div class="card-body">
          <div class="card-nombre">${p.nombre}</div>
          <a href="tienda.html?id=${p.vendedor_id}" class="card-tienda"
             onclick="event.stopPropagation()">
            🏪 ${p.nombre_panaderia}
          </a>
          <div class="card-precio">
            ${p.unidad_venta === 'kilo'
        ? `${formatPrecio(p.precio)} / kg`
        : formatPrecio(p.precio)}
          </div>
          ${p.promedio_cal > 0 ? `
            <div style="display:flex;align-items:center;gap:4px;
                        margin-bottom:8px;font-size:0.8rem">
              <span style="color:#F0A500">★</span>
              <span style="font-weight:700">${p.promedio_cal.toFixed(1)}</span>
            </div>
          ` : ''}
          ${p.dato_extra
        ? `<div style="font-size:0.78rem;color:var(--gris);margin-bottom:8px">
                 ℹ️ ${p.dato_extra}
               </div>`
        : ''}
          <div style="display:flex;gap:8px;margin-top:8px">
            <a href="producto.html?id=${p.id}"
               class="btn btn-ghost btn-sm"
               onclick="event.stopPropagation()"
               aria-label="Ver ${p.nombre}"
               style="flex:1;justify-content:center">
              Ver
            </a>
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

export function setCat(c) { cat = c; renderProductos() }
export function setBusq(b) { busq = b; renderProductos() }