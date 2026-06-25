import { supabase } from './supabase.js'
import { formatPrecio, getIniciales } from './utils.js'
import { getUser, getPerfil } from './auth.js'

// -- Nav usuario --
getUser().then(async user => {
  const btn = document.getElementById('nav-btn')
  if (!user) { btn.href = 'login.html'; btn.textContent = 'Ingresar'; return }
  const perfil = await getPerfil(user.id)
  if (perfil?.tipo === 'vendedor') {
    btn.href = 'vendedor.html'; btn.textContent = 'Mi panel 📊'
  } else if (perfil?.tipo === 'admin') {
    btn.href = 'admin.html'; btn.textContent = 'Admin ⚙️'
  } else {
    btn.href = 'historial.html'
    btn.textContent = `Hola, ${perfil?.nombre?.split(' ')[0]} 👋`
  }
})

// -- Stats hero --
async function cargarStats() {
  const { data: vendAprobados } = await supabase
    .from('profiles')
    .select('id')
    .eq('tipo', 'vendedor')
    .eq('estado_verificacion', 'aprobado')

  const idsAprobados = (vendAprobados || []).map(v => v.id)

  const [
    { count: cProds },
    { count: cPans },
    { count: cPeds }
  ] = await Promise.all([
    idsAprobados.length > 0
      ? supabase.from('productos')
        .select('id', { count: 'exact', head: true })
        .eq('activo', true)
        .in('vendedor_id', idsAprobados)
      : Promise.resolve({ count: 0 }),
    supabase.from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'vendedor')
      .eq('estado_verificacion', 'aprobado'),
    supabase.from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'entregado')
  ])

  document.getElementById('stat-productos').textContent = cProds || 0
  document.getElementById('stat-panaderias').textContent = cPans || 0
  document.getElementById('stat-pedidos').textContent = cPeds || 0
}

// -- Carrusel destacados --
let carruselItems = []
let carruselIdx = 0
let carruselTimer = null
const VISIBLE = window.innerWidth < 768 ? 1 : window.innerWidth < 1024 ? 2 : 3

async function cargarDestacados() {
  const { data: cals } = await supabase
    .from('calificaciones').select('producto_id, estrellas')

  const calMap = {}
  ;(cals || []).forEach(c => {
    if (!calMap[c.producto_id]) calMap[c.producto_id] = []
    calMap[c.producto_id].push(c.estrellas)
  })

  const { data: pedItems } = await supabase
    .from('pedidos').select('items').eq('estado', 'entregado')

  const ventasMap = {}
  ;(pedItems || []).forEach(p => {
    ;(p.items || []).forEach(i => {
      ventasMap[i.id || i.producto_id] = (ventasMap[i.id || i.producto_id] || 0) + i.cantidad
    })
  })

  const { data: prods } = await supabase
    .from('productos')
    .select('*, profiles!inner(nombre_panaderia, nombre, estado_verificacion)')
    .eq('activo', true)
    .eq('profiles.estado_verificacion', 'aprobado')
    .limit(20)

  if (!prods || prods.length === 0) {
    document.getElementById('carrusel-track').innerHTML =
      '<p style="color:var(--gris);padding:20px">Aún no hay productos destacados</p>'
    return
  }

  carruselItems = prods.map(p => {
    const calsP = calMap[p.id] || []
    const promedio = calsP.length
      ? calsP.reduce((a, b) => a + b, 0) / calsP.length : 0
    const ventas = ventasMap[p.id] || 0
    const score = promedio * 2 + ventas * 0.5

    let badge, badgeClass
    if (ventas >= 5) {
      badge = '🏆 Más vendido'; badgeClass = 'badge-vendido'
    } else if (promedio >= 4) {
      badge = '⭐ Mejor calificado'; badgeClass = 'badge-calificado'
    } else {
      badge = '🔥 Tendencia'; badgeClass = 'badge-tendencia'
    }

    return {
      ...p,
      nombre_panaderia: p.profiles?.nombre_panaderia || p.profiles?.nombre || 'Panadería',
      promedio, ventas, score, badge, badgeClass
    }
  }).sort((a, b) => b.score - a.score).slice(0, 9)

  renderCarrusel()
  renderDots()
  iniciarAutoAvance()
}

function renderCarrusel() {
  const track = document.getElementById('carrusel-track')
  track.innerHTML = carruselItems.map(p => `
    <a class="carrusel-card" href="producto.html?id=${p.id}">
      ${p.imagen_url
        ? `<img class="carrusel-img" src="${p.imagen_url}" alt="${p.nombre}" loading="lazy">`
        : `<div class="carrusel-img-ph">
             ${p.categoria === 'pan' ? '🍞' : p.categoria === 'facturas' ? '🥐'
               : p.categoria === 'galletas' ? '🍪' : p.categoria === 'cakes' ? '🎂' : '✨'}
           </div>`}
      <div class="carrusel-body">
        <span class="carrusel-badge ${p.badgeClass}">${p.badge}</span>
        <div class="carrusel-nombre">${p.nombre}</div>
        <div class="carrusel-pan">🏪 ${p.nombre_panaderia}</div>
        <div class="carrusel-precio">
          ${p.unidad_venta === 'kilo'
            ? `${formatPrecio(p.precio)}/kg`
            : formatPrecio(p.precio)}
        </div>
      </div>
    </a>
  `).join('')
  moverCarrusel()
}

function moverCarrusel() {
  const track = document.getElementById('carrusel-track')
  const cardW = track.querySelector('.carrusel-card')?.offsetWidth || 0
  const gap = 18
  track.style.transform = `translateX(-${carruselIdx * (cardW + gap)}px)`
  document.querySelectorAll('.carrusel-dot').forEach((d, i) => {
    d.classList.toggle('on', i === carruselIdx)
  })
}

function renderDots() {
  const total = Math.max(0, carruselItems.length - VISIBLE + 1)
  const dots = document.getElementById('carrusel-dots')
  dots.innerHTML = Array(total).fill(0).map((_, i) => `
    <div class="carrusel-dot ${i === 0 ? 'on' : ''}" data-i="${i}"></div>
  `).join('')
  dots.querySelectorAll('.carrusel-dot').forEach(d => {
    d.addEventListener('click', () => {
      carruselIdx = parseInt(d.dataset.i)
      moverCarrusel()
      reiniciarTimer()
    })
  })
}

function iniciarAutoAvance() {
  carruselTimer = setInterval(() => {
    const maxIdx = Math.max(0, carruselItems.length - VISIBLE)
    carruselIdx = carruselIdx >= maxIdx ? 0 : carruselIdx + 1
    moverCarrusel()
  }, 4000)
}

function reiniciarTimer() {
  clearInterval(carruselTimer)
  iniciarAutoAvance()
}

document.getElementById('carr-prev').addEventListener('click', () => {
  const maxIdx = Math.max(0, carruselItems.length - VISIBLE)
  carruselIdx = carruselIdx <= 0 ? maxIdx : carruselIdx - 1
  moverCarrusel(); reiniciarTimer()
})
document.getElementById('carr-next').addEventListener('click', () => {
  const maxIdx = Math.max(0, carruselItems.length - VISIBLE)
  carruselIdx = carruselIdx >= maxIdx ? 0 : carruselIdx + 1
  moverCarrusel(); reiniciarTimer()
})

document.getElementById('carrusel-wrap').addEventListener('mouseenter', () => clearInterval(carruselTimer))
document.getElementById('carrusel-wrap').addEventListener('mouseleave', iniciarAutoAvance)

// -- Panaderías grid --
async function cargarPanaderias() {
  const { data } = await supabase
    .from('profiles')
    .select('id, nombre_panaderia, nombre, avatar_url, descripcion')
    .eq('tipo', 'vendedor')
    .eq('estado_verificacion', 'aprobado')

  const el = document.getElementById('pans-grid')
  if (!data || data.length === 0) {
    el.innerHTML = '<p style="color:var(--gris)">Aún no hay panaderías registradas</p>'
    return
  }

  el.innerHTML = data.map(p => `
    <a href="tienda.html?id=${p.id}" class="pan-landing-card">
      <div class="pan-landing-avatar">
        ${p.avatar_url
          ? `<img src="${p.avatar_url}" alt="${p.nombre_panaderia || p.nombre}">`
          : getIniciales(p.nombre_panaderia || p.nombre)}
      </div>
      <div class="pan-landing-nombre">${p.nombre_panaderia || p.nombre}</div>
      <div class="pan-landing-desc">${p.descripcion || 'Panadería artesanal'}</div>
    </a>
  `).join('')
}

// -- Init --
cargarStats()
cargarDestacados()
cargarPanaderias()