import { supabase } from './supabase.js'
import {
  toast, formatPrecio, catEmoji,
  catLabel, getIniciales, debounce
} from './utils.js'
import {
  agregarItem, actualizarBadge,
  renderCarrito
} from './carrito.js'

actualizarBadge()

const params = new URLSearchParams(location.search)
const vendedorId = params.get('id')
if (!vendedorId) location.href = 'index.html'

let productos = []
let catActual = 'todos'
let busqueda = ''
let nombrePan = ''

async function cargarPerfil() {
  const { data: p } = await supabase
    .from('profiles').select('*').eq('id', vendedorId).single()
  if (!p) {
    document.getElementById('tienda-info').innerHTML =
      '<p style="color:white">Panadería no encontrada</p>'
    return
  }

  document.title = `${p.nombre_panaderia || p.nombre} — PanaderiaMarket`
  nombrePan = p.nombre_panaderia || p.nombre

  document.getElementById('tienda-info').innerHTML = `
    <div class="tienda-avatar"
         style="${p.avatar_url
      ? `background:url('${p.avatar_url}') center/cover;font-size:0`
      : ''}">
      ${p.avatar_url ? '' : getIniciales(p.nombre_panaderia || p.nombre)}
    </div>
    <div>
      <div class="tienda-nombre">${p.nombre_panaderia || p.nombre}</div>
      <p class="tienda-desc">${p.descripcion || 'Panadería artesanal'}</p>
      <div class="tienda-meta">
        ${p.instagram
      ? `<a href="https://instagram.com/${p.instagram}"
                 target="_blank" rel="noopener">📸 @${p.instagram}</a>` : ''}
        ${p.telefono
      ? `<a href="tel:${p.telefono}">📞 ${p.telefono}</a>` : ''}
        ${p.email_contacto
      ? `<a href="mailto:${p.email_contacto}">✉️ ${p.email_contacto}</a>` : ''}
      </div>
      ${p.telefono ? `
        <a href="https://wa.me/${p.telefono.replace(/\D/g, '')}?text=${encodeURIComponent('Hola! Vi tu tienda en PanaderiaMarket 🥖')}"
           target="_blank" rel="noopener"
           style="display:inline-flex;align-items:center;gap:8px;
                  background:#25D366;color:white;padding:9px 18px;
                  border-radius:50px;font-weight:700;font-size:0.88rem;
                  margin-top:12px;text-decoration:none">
          💬 Consultar por WhatsApp
        </a>
      ` : ''}
    </div>
  `

  if (p.banner_anuncio) {
    const banner = document.createElement('div')
    banner.style.cssText =
      'background:linear-gradient(90deg,var(--naranja),var(--naranja-lt));' +
      'color:white;text-align:center;padding:12px 20px;' +
      'font-weight:700;font-size:0.9rem;'
    banner.textContent = `📢 ${p.banner_anuncio}`
    document.getElementById('tienda-header-wrap').after(banner)
  }

  if (p.latitud && p.longitud) {
    mostrarMapaTienda(p.latitud, p.longitud, p.direccion, p.nombre_panaderia || p.nombre)
  }
}

function mostrarMapaTienda(lat, lng, direccion, nombrePanaderia) {
  const contenedor = document.getElementById('mapa-tienda')
  if (!contenedor || typeof L === 'undefined') return

  const mapa = L.map('mapa-tienda', { zoomControl: true, scrollWheelZoom: false })
    .setView([lat, lng], 16)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(mapa)

  const marker = L.marker([lat, lng]).addTo(mapa)
  marker.bindPopup(
    `<strong>${nombrePanaderia}</strong>${direccion ? '<br>' + direccion : ''}`,
    { autoClose: false }
  ).openPopup()

  const secMapa = document.getElementById('sec-mapa-tienda')
  if (secMapa) {
    secMapa.style.display = 'block'
    setTimeout(() => mapa.invalidateSize(), 50)
  }

  const textoDir = document.getElementById('texto-direccion-tienda')
  if (textoDir && direccion) textoDir.textContent = direccion

  const linkMaps = document.getElementById('link-mapa-externo')
  if (linkMaps) linkMaps.href = `https://www.google.com/maps?q=${lat},${lng}`
}

async function cargarProductos() {
  const grid = document.getElementById('grid-tienda')
  grid.innerHTML = Array(6).fill(`
    <div class="skeleton" style="height:290px;border-radius:var(--radio-lg)"></div>
  `).join('')

  const { data } = await supabase
    .from('productos').select('*')
    .eq('vendedor_id', vendedorId)
    .eq('activo', true)
    .order('created_at', { ascending: false })

  productos = data || []
  generarFiltros()
  render()
}

function generarFiltros() {
  const cats = ['todos', ...new Set(productos.map(p => p.categoria).filter(Boolean))]
  const labels = {
    todos: 'Todos', pan: '🍞 Pan', facturas: '🥐 Facturas',
    galletas: '🍪 Galletas', cakes: '🎂 Cakes', otro: '✨ Otro'
  }
  document.getElementById('filtros-tienda').innerHTML = cats.map(c => `
    <button class="filtro ${c === 'todos' ? 'on' : ''}"
            data-cat="${c}" aria-pressed="${c === 'todos'}">
      ${labels[c] || c}
    </button>
  `).join('')

  document.querySelectorAll('#filtros-tienda .filtro').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filtros-tienda .filtro').forEach(b => {
        b.classList.remove('on'); b.setAttribute('aria-pressed', 'false')
      })
      btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true')
      catActual = btn.dataset.cat
      render()
    })
  })
}

function render() {
  let lista = catActual === 'todos'
    ? productos
    : productos.filter(p => p.categoria === catActual)

  if (busqueda.trim()) {
    const q = busqueda.toLowerCase()
    lista = lista.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.descripcion || '').toLowerCase().includes(q)
    )
  }

  const grid = document.getElementById('grid-tienda')
  const empty = document.getElementById('empty-tienda')
  const count = document.getElementById('count-tienda')

  count.textContent = `${lista.length} producto${lista.length !== 1 ? 's' : ''}`

  if (lista.length === 0) {
    grid.innerHTML = ''; empty.style.display = 'block'; return
  }
  empty.style.display = 'none'

  grid.innerHTML = lista.map(p => {
    const sinStock = p.cantidad_disponible === 0
    return `
      <article class="card ${sinStock ? 'sin-stock' : ''}"
               data-id="${p.id}" tabindex="0" role="article">
        <span class="card-cat badge badge-${p.categoria || 'otro'}">
          ${catLabel(p.categoria)}
        </span>
        ${p.imagen_url
        ? `<img class="card-img" src="${p.imagen_url}" alt="${p.nombre}" loading="lazy">`
        : `<div class="card-img-ph">${catEmoji(p.categoria)}</div>`}
        <div class="card-body">
          <div class="card-nombre">${p.nombre}</div>
          ${p.descripcion
        ? `<div style="font-size:0.8rem;color:var(--gris);margin-bottom:6px;line-height:1.4">${p.descripcion}</div>`
        : ''}
          <div class="card-precio">
            ${p.unidad_venta === 'kilo'
        ? `${formatPrecio(p.precio)} / kg`
        : formatPrecio(p.precio)}
          </div>
          ${p.precio_media_docena && p.unidad_venta !== 'kilo'
        ? `<div style="font-size:0.78rem;color:var(--gris)">Media doc: ${formatPrecio(p.precio_media_docena)}</div>` : ''}
          ${p.precio_docena && p.unidad_venta !== 'kilo'
        ? `<div style="font-size:0.78rem;color:var(--gris);margin-bottom:8px">Docena: ${formatPrecio(p.precio_docena)}</div>` : ''}
          ${p.dato_extra
        ? `<div style="font-size:0.78rem;background:var(--crema);padding:5px 9px;border-radius:6px;margin-bottom:8px">ℹ️ ${p.dato_extra}</div>`
        : ''}
          <div style="display:flex;gap:8px;margin-top:8px">
            <a href="producto.html?id=${p.id}" class="btn btn-ghost btn-sm"
               onclick="event.stopPropagation()"
               style="flex:1;justify-content:center;font-size:0.8rem">Ver</a>
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
      const prod = productos.find(p => p.id === btn.dataset.id)
      if (prod) {
        agregarItem({ ...prod, nombre_panaderia: nombrePan })
        toast(`${prod.nombre} agregado 🛒`, 'ok')
      }
    })
  })
}

const onSearch = debounce(v => { busqueda = v; render() }, 250)
document.getElementById('search-tienda').addEventListener('input',
  e => onSearch(e.target.value))

function toggleCart(abrir) {
  document.getElementById('cart-drawer').classList.toggle('open', abrir)
  document.getElementById('cart-overlay').classList.toggle('open', abrir)
  if (abrir) renderCarrito()
}
document.getElementById('cart-toggle').addEventListener('click', () => toggleCart(true))
document.getElementById('cart-close').addEventListener('click', () => toggleCart(false))
document.getElementById('cart-overlay').addEventListener('click', () => toggleCart(false))

cargarPerfil()
cargarProductos()