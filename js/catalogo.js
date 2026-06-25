import { debounce, formatPrecio }         from './utils.js'
import { actualizarBadge, renderCarrito } from './carrito.js'
import { cargarProductos, renderProductos,
         setCat, setBusq }                from './productos.js'
import { getUser, getPerfil }             from './auth.js'
import { initSugerencias }                from './sugerencias.js'
import { supabase }                       from './supabase.js'

actualizarBadge()
cargarProductos()
cargarPanaderias()

// -- Nav usuario --
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

// -- Cargar panaderías en el sidebar --
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

// -- Búsqueda --
const onBusq = debounce(v => setBusq(v), 250)
document.getElementById('search-catalogo').addEventListener('input',
  e => onBusq(e.target.value))

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
    precio: p.unidad_venta === 'kilo'
      ? `${formatPrecio(p.precio)}/kg` : formatPrecio(p.precio)
  }))
})

// -- Filtros categoría --
document.querySelectorAll('.filtro').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filtro').forEach(b => {
      b.classList.remove('on'); b.setAttribute('aria-pressed','false')
    })
    btn.classList.add('on'); btn.setAttribute('aria-pressed','true')
    setCat(btn.dataset.cat)
  })
})

// -- Ordenar --
document.getElementById('ordenar').addEventListener('change', renderProductos)

// -- Carrito --
function toggleCart(abrir) {
  document.getElementById('cart-drawer').classList.toggle('open', abrir)
  document.getElementById('cart-overlay').classList.toggle('open', abrir)
  if (abrir) renderCarrito()
}
document.getElementById('cart-toggle').addEventListener('click',  () => toggleCart(true))
document.getElementById('cart-close').addEventListener('click',   () => toggleCart(false))
document.getElementById('cart-overlay').addEventListener('click', () => toggleCart(false))

// -- sidebar CEL --
document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
  document.getElementById('sidebar-pan').classList.toggle('open')
})

// -- Buscador panaderías en sidebar --
document.getElementById('search-panaderias').addEventListener('input',
  debounce(e => {
    const q = e.target.value.toLowerCase()
    document.querySelectorAll('#panaderias-list .pan-chip').forEach(chip => {
      const nombre = chip.textContent.toLowerCase()
      chip.style.display = nombre.includes(q) ? 'flex' : 'none'
    })
  }, 200)
)

// -- Recarga todo si cambia la verificación del vendedor --
supabase
  .channel('catalogo-vendedores')
  .on('postgres_changes', {
    event:  'UPDATE',
    schema: 'public',
    table:  'profiles',
    filter: `tipo=eq.vendedor`
  }, payload => {
    if (payload.old.estado_verificacion !== payload.new.estado_verificacion) {
      cargarProductos()
      cargarPanaderias()
    }
  })
  .subscribe()