import { supabase } from './supabase.js'
import { toast, formatPrecio, catLabel, catEmoji, getIniciales } from './utils.js'
import { agregarItem, actualizarBadge, renderCarrito } from './carrito.js'
import { renderEstrellas } from './calificaciones.js'

actualizarBadge()

const params = new URLSearchParams(location.search)
const id = params.get('id')
if (!id) location.href = 'index.html'

async function cargar() {
  const { data: p } = await supabase
    .from('productos')
    .select('*, profiles(nombre_panaderia, nombre, telefono, avatar_url)')
    .eq('id', id).single()

  if (!p) { location.href = 'index.html'; return }

  document.title = `${p.nombre} — PanaderiaMarket`

  const { data: fotos } = await supabase
    .from('producto_fotos').select('*')
    .eq('producto_id', p.id).order('orden')

  const todas = [
    ...(p.imagen_url ? [{ url: p.imagen_url }] : []),
    ...(fotos || [])
  ]

  const sinStock = p.cantidad_disponible === 0
  const nombrePan = p.profiles?.nombre_panaderia || p.profiles?.nombre || 'Panadería'
  const telefono = p.profiles?.telefono || null

  document.getElementById('prod-wrap').innerHTML = `
    <div class="prod-layout">

      <!-- Galería -->
      <div>
        ${todas.length > 0
          ? `<img id="main-img" class="prod-galeria-main" src="${todas[0].url}" alt="${p.nombre}">`
          : `<div class="prod-galeria-main"
                   style="display:flex;align-items:center;justify-content:center;font-size:5rem">
               ${catEmoji(p.categoria)}
             </div>`}
        ${todas.length > 1
          ? `<div class="prod-thumbs">
               ${todas.map((f, i) => `
                 <img src="${f.url}" class="prod-thumb ${i === 0 ? 'on' : ''}"
                      data-src="${f.url}" alt="Foto ${i + 1}">
               `).join('')}
             </div>`
          : ''}
      </div>

      <!-- Info -->
      <div>
        <span class="badge badge-${p.categoria}">${catLabel(p.categoria)}</span>
        <h1 style="margin:10px 0 4px">${p.nombre}</h1>
        <a href="tienda.html?id=${p.vendedor_id}"
           style="color:var(--naranja);font-weight:700;font-size:0.95rem;display:block;margin-bottom:10px">
          🏪 ${nombrePan} →
        </a>

        <div id="estrellas-prod"></div>

        ${p.descripcion
          ? `<p style="color:var(--gris);margin:14px 0;line-height:1.7">${p.descripcion}</p>`
          : ''}
        ${p.dato_extra
          ? `<div style="background:var(--crema);padding:10px 14px;border-radius:var(--radio);
                         font-size:0.88rem;margin-bottom:16px">ℹ️ ${p.dato_extra}</div>`
          : ''}

        <div class="prod-precios">
          ${p.unidad_venta === 'kilo' ? `
            <div class="prod-precio-row">
              <span>Por kilo</span>
              <span class="prod-precio-val">${formatPrecio(p.precio)}</span>
            </div>
          ` : `
            <div class="prod-precio-row">
              <span>Unidad</span>
              <span class="prod-precio-val">${formatPrecio(p.precio)}</span>
            </div>
            ${p.precio_media_docena ? `
              <div class="prod-precio-row">
                <span>Media docena</span>
                <span class="prod-precio-val">${formatPrecio(p.precio_media_docena)}</span>
              </div>` : ''}
            ${p.precio_docena ? `
              <div class="prod-precio-row">
                <span>Docena</span>
                <span class="prod-precio-val">${formatPrecio(p.precio_docena)}</span>
              </div>` : ''}
          `}
        </div>

        ${sinStock ? `
          <div class="sin-stock-overlay">
            <div style="font-size:2rem;margin-bottom:6px">😔</div>
            <strong>Sin stock disponible</strong>
            <p style="font-size:0.85rem;color:var(--gris);margin-top:4px">
              Consultá al vendedor si podés hacer un pedido especial
            </p>
          </div>
        ` : ''}

        <div style="display:flex;flex-direction:column;gap:10px">
          ${!sinStock ? `
            <button class="btn btn-naranja btn-full" id="btn-agregar">
              🛒 Agregar al carrito
            </button>
          ` : ''}
          ${telefono ? `
            <a href="https://wa.me/${telefono.replace(/\D/g, '')}?text=${encodeURIComponent(
              `Hola! Vi el producto "${p.nombre}" en PanaderiaMarket y me interesa 🥖`
            )}"
               target="_blank" rel="noopener"
               class="btn btn-full"
               style="background:#25D366;color:white;justify-content:center">
              💬 Consultar por WhatsApp
            </a>
          ` : ''}
          <div style="display:flex;gap:8px">
            <a href="tienda.html?id=${p.vendedor_id}" class="btn btn-ghost btn-full">
              Ver toda la tienda
            </a>
            <button class="btn btn-ghost" id="btn-compartir" title="Compartir producto">🔗</button>
          </div>
        </div>
      </div>
    </div>
  `

  document.querySelectorAll('.prod-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      document.getElementById('main-img').src = thumb.dataset.src
      document.querySelectorAll('.prod-thumb').forEach(t => t.classList.remove('on'))
      thumb.classList.add('on')
    })
  })

  document.getElementById('btn-agregar')?.addEventListener('click', () => {
    agregarItem({ ...p, nombre_panaderia: nombrePan })
    toast(`${p.nombre} agregado 🛒`, 'ok')
  })

  document.getElementById('btn-compartir')?.addEventListener('click', () => {
    if (navigator.share) {
      navigator.share({ title: p.nombre, url: location.href })
    } else {
      navigator.clipboard.writeText(location.href)
      toast('Link copiado al portapapeles 🔗', 'ok')
    }
  })

  renderEstrellas(p.id, 'estrellas-prod')
}

function toggleCart(abrir) {
  document.getElementById('cart-drawer').classList.toggle('open', abrir)
  document.getElementById('cart-overlay').classList.toggle('open', abrir)
  if (abrir) renderCarrito()
}
document.getElementById('cart-toggle').addEventListener('click',  () => toggleCart(true))
document.getElementById('cart-close').addEventListener('click',   () => toggleCart(false))
document.getElementById('cart-overlay').addEventListener('click', () => toggleCart(false))

cargar()