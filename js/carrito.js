import { formatPrecio } from './utils.js'

const KEY = 'pm_carrito'

export function getCarrito() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

function guardar(items) {
  localStorage.setItem(KEY, JSON.stringify(items))
  actualizarBadge()
}

export function agregarItem(producto, cantidad = 1, variante = 'unidad') {
  const items = getCarrito()
  const key   = `${producto.id}_${variante}`
  const idx   = items.findIndex(i => i.key === key)
  const precio = variantePrecio(producto, variante)
  if (idx >= 0) {
    items[idx].cantidad += cantidad
  } else {
    items.push({
      key, id: producto.id,
      nombre: producto.nombre,
      precio,
      imagen_url: producto.imagen_url || null,
      vendedor_id: producto.vendedor_id,
      nombre_panaderia: producto.nombre_panaderia || '',
      variante, cantidad
    })
  }
  guardar(items)
}

export function quitarItem(key) {
  guardar(getCarrito().filter(i => i.key !== key))
}

export function cambiarCantidad(key, delta) {
  const items = getCarrito()
  const idx = items.findIndex(i => i.key === key)
  if (idx < 0) return
  items[idx].cantidad = Math.max(1, items[idx].cantidad + delta)
  guardar(items)
}

export function vaciarCarrito() {
  guardar([])
}

export function totalCarrito() {
  return getCarrito().reduce((acc, i) => acc + i.precio * i.cantidad, 0)
}

export function cantidadTotal() {
  return getCarrito().reduce((acc, i) => acc + i.cantidad, 0)
}

function variantePrecio(p, variante) {
  if (variante === 'docena'       && p.precio_docena)        return p.precio_docena
  if (variante === 'media_docena' && p.precio_media_docena)  return p.precio_media_docena
  return p.precio
}

export function actualizarBadge() {
  const badge = document.querySelector('.cart-badge')
  if (!badge) return
  const n = cantidadTotal()
  badge.textContent = n
  badge.style.display = n > 0 ? 'flex' : 'none'
}

export function renderCarrito() {
  const body   = document.getElementById('cart-body')
  const footer = document.getElementById('cart-footer')
  if (!body) return

  const items = getCarrito()

  if (items.length === 0) {
    body.innerHTML = `
      <div class="cart-empty">
        <span>🛒</span>
        <p>Tu carrito está vacío</p>
      </div>`
    if (footer) footer.innerHTML = ''
    return
  }

  body.innerHTML = items.map(i => `
    <div class="cart-item" data-key="${i.key}">
      <div class="cart-item-img">
        ${i.imagen_url
          ? `<img src="${i.imagen_url}" alt="${i.nombre}">`
          : `<span>${i.nombre[0]}</span>`}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-nombre">${i.nombre}</div>
        <div class="cart-item-sub">${i.nombre_panaderia} · ${i.variante}</div>
        <div class="cart-item-precio">${formatPrecio(i.precio * i.cantidad)}</div>
        <div class="cart-qty">
          <button onclick="window._cartMenos('${i.key}')">−</button>
          <span>${i.cantidad}</span>
          <button onclick="window._cartMas('${i.key}')">+</button>
          <button class="cart-del" onclick="window._cartDel('${i.key}')">🗑</button>
        </div>
      </div>
    </div>`).join('')

  if (footer) {
    footer.innerHTML = `
      <div class="cart-total">
        <span>Total</span>
        <strong>${formatPrecio(totalCarrito())}</strong>
      </div>
      <button class="btn btn-naranja btn-full" id="btn-ir-checkout">
        Finalizar pedido →
      </button>`

    document.getElementById('btn-ir-checkout').addEventListener('click', async () => {
      const { getUser, requireAuthParaComprar } = await import('./auth.js')
      const user = await getUser()
      if (!user) {
        await requireAuthParaComprar()
      } else {
        window.location.href = 'checkout.html'
      }
    })
  }
}

window._cartMenos = (key) => { cambiarCantidad(key, -1); renderCarrito() }
window._cartMas   = (key) => { cambiarCantidad(key,  1); renderCarrito() }
window._cartDel   = (key) => { quitarItem(key);           renderCarrito() }