import { supabase }                  from './supabase.js'
import { toast, formatPrecio }       from './utils.js'
import { getCarrito, vaciarCarrito } from './carrito.js'
import { getUser, getPerfil,
         requireAuthParaComprar }    from './auth.js'
import { abrirTicket }               from './ticket.js'

const LABELS_PAGO = {
  efectivo:      { ico: '💵', label: 'Efectivo' },
  transferencia: { ico: '📲', label: 'Transferencia' },
  debito:        { ico: '💳', label: 'Débito' },
  credito:       { ico: '💳', label: 'Crédito' },
}

let grupos = {}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str ?? ''
  return div.innerHTML
}

async function verificarAcceso() {
  const user = await getUser()
  if (!user) { await requireAuthParaComprar(); return null }
  return user
}

async function cargarResumen() {
  const items = getCarrito()
  const el    = document.getElementById('resumen-items')

  if (items.length === 0) {
    el.innerHTML = '<p style="color:var(--gris)">Tu carrito está vacío</p>'
    document.getElementById('resumen-total').textContent = '$0'
    document.getElementById('tarjeta-wrap').classList.remove('show')
    grupos = {}
    return
  }

  const porVendedor = {}
  items.forEach(i => {
    if (!porVendedor[i.vendedor_id]) porVendedor[i.vendedor_id] = []
    porVendedor[i.vendedor_id].push(i)
  })

  const ids = Object.keys(porVendedor)
  const { data: perfiles } = await supabase
    .from('profiles')
    .select('id,nombre_panaderia,nombre,medios_pago,cbu,alias_cbu,titular_cuenta')
    .in('id', ids)

  grupos = {}
  ids.forEach(vid => {
    const p = (perfiles || []).find(x => x.id === vid) || {}
    let medios = Array.isArray(p.medios_pago) && p.medios_pago.length > 0
      ? [...p.medios_pago] : ['efectivo']
    if (!medios.includes('efectivo')) medios.unshift('efectivo')
    grupos[vid] = {
      nombre:  p.nombre_panaderia || p.nombre || 'Panadería',
      items:   porVendedor[vid],
      medios,
      cbu:     p.cbu         || null,
      alias:   p.alias_cbu   || null,
      titular: p.titular_cuenta || null,
      pagoSel: 'efectivo'
    }
  })

  renderResumen()
}

function renderResumen() {
  const el = document.getElementById('resumen-items')
  let totalGeneral = 0

  el.innerHTML = Object.entries(grupos).map(([vid, g]) => {
    const subtotal = g.items.reduce((acc, i) => acc + i.precio * i.cantidad, 0)
    totalGeneral += subtotal

    const itemsHtml = g.items.map(i => `
      <div class="resumen-item">
        <span class="resumen-nombre">${escapeHtml(i.nombre)}</span>
        <span class="resumen-cant">× ${i.cantidad}</span>
        <span class="resumen-precio">${formatPrecio(i.precio * i.cantidad)}</span>
      </div>
    `).join('')

    const pagoOpts = g.medios.map(m => {
      const info = LABELS_PAGO[m] || { ico: '💰', label: m }
      return `
        <div class="pago-opt ${g.pagoSel === m ? 'on' : ''}"
             data-vendedor="${vid}" data-pago="${m}"
             tabindex="0" role="radio" aria-checked="${g.pagoSel === m}">
          <span class="pago-ico">${info.ico}</span> ${info.label}
        </div>`
    }).join('')

    const cbuBox = g.pagoSel === 'transferencia' ? `
      <div class="cbu-box">
        <strong>Datos para transferir a ${escapeHtml(g.nombre)}:</strong>
        ${g.cbu     ? `<div>CBU: <strong>${escapeHtml(g.cbu)}</strong></div>` : ''}
        ${g.alias   ? `<div>Alias: <strong>${escapeHtml(g.alias)}</strong></div>` : ''}
        ${g.titular ? `<div>Titular: ${escapeHtml(g.titular)}</div>` : ''}
        ${!g.cbu && !g.alias
          ? '<div style="color:var(--gris)">Este vendedor no completó sus datos de transferencia.</div>'
          : ''}
      </div>` : ''

    return `
      <div class="vendor-pago-group" data-vendedor="${vid}">
        <h4 class="vendor-pago-titulo">🏪 ${escapeHtml(g.nombre)}</h4>
        ${itemsHtml}
        <div class="subtotal-row">
          <span>Subtotal</span>
          <span>${formatPrecio(subtotal)}</span>
        </div>
        <div class="pago-opts pago-opts-vendor" role="radiogroup" data-vendedor="${vid}">
          ${pagoOpts}
        </div>
        ${cbuBox}
      </div>
    `
  }).join('')

  document.getElementById('resumen-total').textContent = formatPrecio(totalGeneral)

  const necesitaTarjeta = Object.values(grupos)
    .some(g => g.pagoSel === 'debito' || g.pagoSel === 'credito')
  document.getElementById('tarjeta-wrap').classList.toggle('show', necesitaTarjeta)

  el.querySelectorAll('.pago-opt').forEach(opt => {
    opt.addEventListener('click', () =>
      seleccionarPago(opt.dataset.vendedor, opt.dataset.pago))
    opt.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') opt.click()
    })
  })
}

function seleccionarPago(vid, pago) {
  if (!grupos[vid] || !grupos[vid].medios.includes(pago)) return
  grupos[vid].pagoSel = pago
  renderResumen()
}

async function prellenarDatos(user) {
  const p = await getPerfil(user.id)
  if (p) {
    document.getElementById('co-nombre').value = p.nombre   || ''
    document.getElementById('co-email').value  = user.email || ''
  }
  const { data: tarjetas } = await supabase
    .from('tarjetas').select('*').eq('user_id', user.id).limit(1)
  if (tarjetas && tarjetas.length > 0) {
    const t = tarjetas[0]
    document.getElementById('tv-numero').textContent = t.numero_enmascarado
    document.getElementById('tv-brand').textContent  = t.tipo || 'CARD'
  }
}

// ── Tarjeta visual ──
document.getElementById('t-numero').addEventListener('input', e => {
  let v = e.target.value.replace(/\D/g,'').slice(0,16)
  const fmt = v.replace(/(.{4})/g,'$1 ').trim()
  e.target.value = fmt
  document.getElementById('tv-numero').textContent = fmt || '•••• •••• •••• ••••'
  const brand = v[0]==='4' ? 'VISA' : v[0]==='5' ? 'MASTERCARD' :
                v.startsWith('34')||v.startsWith('37') ? 'AMEX' : 'CARD'
  document.getElementById('tv-brand').textContent = brand
})

document.getElementById('t-nombre').addEventListener('input', e => {
  document.getElementById('tv-nombre').textContent =
    e.target.value.toUpperCase() || 'TU NOMBRE'
})

document.getElementById('t-vence').addEventListener('input', e => {
  let v = e.target.value.replace(/\D/g,'').slice(0,4)
  if (v.length >= 3) v = v.slice(0,2) + '/' + v.slice(2)
  e.target.value = v
  document.getElementById('tv-vence').textContent = v || 'MM/AA'
})

document.getElementById('t-cvv').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g,'').slice(0,4)
})

// ── Confirmar pedido ──
document.getElementById('btn-finalizar').addEventListener('click', async () => {
  const items = getCarrito()
  if (items.length === 0) { toast('Tu carrito está vacío', 'err'); return }
  if (Object.keys(grupos).length === 0) { toast('Error al cargar el carrito', 'err'); return }

  const nombre = document.getElementById('co-nombre').value.trim()
  const email  = document.getElementById('co-email').value.trim()
  if (!nombre || !email) { toast('Completá nombre y email', 'err'); return }

  for (const g of Object.values(grupos)) {
    if (!g.medios.includes(g.pagoSel)) {
      toast(`Medio de pago inválido para ${g.nombre}`, 'err'); return
    }
  }

  const necesitaTarjeta = Object.values(grupos)
    .some(g => g.pagoSel === 'debito' || g.pagoSel === 'credito')

  if (necesitaTarjeta) {
    const num       = document.getElementById('t-numero').value.replace(/\s/g,'')
    const vence     = document.getElementById('t-vence').value
    const cvv       = document.getElementById('t-cvv').value
    const nombreTit = document.getElementById('t-nombre').value.trim()
    if (num.length < 16)  { toast('Ingresá un número de tarjeta válido', 'err'); return }
    if (vence.length < 5) { toast('Ingresá la fecha de vencimiento', 'err'); return }
    if (cvv.length < 3)   { toast('Ingresá el CVV', 'err'); return }
    if (!nombreTit)       { toast('Ingresá el nombre del titular', 'err'); return }
  }

  const btn = document.getElementById('btn-finalizar')
  btn.disabled = true; btn.textContent = 'Verificando stock...'

  const user = await getUser()
  if (!user) {
    btn.disabled = false; btn.textContent = 'Confirmar pedido →'
    await requireAuthParaComprar(); return
  }

  const itemsStock = items.map(i => ({ id: i.id, cantidad: i.cantidad }))
  const { error: stockError } = await supabase
    .rpc('descontar_stock_items', { items: itemsStock })

  if (stockError) {
    btn.disabled = false; btn.textContent = 'Confirmar pedido →'
    toast(stockError.message?.includes('STOCK_INSUFICIENTE')
      ? 'Uno o más productos ya no tienen stock suficiente.'
      : 'Error al verificar stock', 'err')
    return
  }

  btn.textContent = 'Enviando pedido...'

  if (necesitaTarjeta) {
    const num      = document.getElementById('t-numero').value.replace(/\s/g,'')
    const ultimos4 = num.slice(-4)
    await supabase.from('tarjetas').upsert({
      user_id:            user.id,
      numero_enmascarado: '•••• •••• •••• ' + ultimos4,
      ultimos_4:          ultimos4,
      tipo:               document.getElementById('tv-brand').textContent
    }, { onConflict: 'user_id' })
  }

  let pedidoCreado = null
  let todoBien     = true

  for (const [vid, g] of Object.entries(grupos)) {
    const total    = g.items.reduce((acc, i) => acc + i.precio * i.cantidad, 0)
    const ticketId = 'TK-' + Date.now().toString(36).toUpperCase() +
                     '-' + Math.random().toString(36).slice(2,6).toUpperCase()
    // --Carga de productos REVISAR --
    const { data, error } = await supabase.from('pedidos').insert({
      comprador_id:     user.id,
      vendedor_id:      vid,
      items:            g.items.map(i => ({
        nombre: i.nombre, cantidad: i.cantidad,
        precio: i.precio, variante: i.variante
      })),
      total,
      estado:           'pendiente',
      medio_pago:       g.pagoSel,
      ticket_id:        ticketId,
      codigo_postal:    document.getElementById('co-cp').value.trim()    || null,
      direccion:        document.getElementById('co-dir').value.trim()   || null,
      notas:            document.getElementById('co-notas').value.trim() || null,
      nombre_comprador: nombre,
      email_comprador:  email,
    }).select().single()

    if (error) { toast('Error al crear pedido: ' + error.message, 'err'); todoBien = false }
    else if (!pedidoCreado) pedidoCreado = data
  }

  btn.disabled = false; btn.textContent = 'Confirmar pedido →'

  if (!todoBien) {
    await supabase.rpc('restaurar_stock_items', { items: itemsStock })
    toast('Error al enviar el pedido. El stock fue restaurado.', 'err')
    return
  }

  vaciarCarrito()
  toast('¡Pedido confirmado! 🎉', 'ok')

  if (pedidoCreado) {
    setTimeout(() => {
      abrirTicket({ ...pedidoCreado, nombre_comprador: nombre, email_comprador: email })
      setTimeout(() => { location.href = 'historial.html' }, 500)
    }, 800)
  } else {
    setTimeout(() => { location.href = 'index.html' }, 1500)
  }
})

// ── Init ──
async function init() {
  const user = await verificarAcceso()
  await cargarResumen()
  if (user) await prellenarDatos(user)
}

init()