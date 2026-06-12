export function toast(msg, tipo = 'inf') {
  let box = document.getElementById('toast-box')
  if (!box) {
    box = document.createElement('div')
    box.id = 'toast-box'
    box.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px'
    document.body.appendChild(box)
  }
  const t = document.createElement('div')
  t.className = `toast toast-${tipo}`
  const iconos = { ok: '✓', err: '✕', inf: 'i' }
  t.innerHTML = `<span class="toast-icon">${iconos[tipo] || 'i'}</span> ${msg}`
  box.appendChild(t)
  setTimeout(() => t.remove(), 3100)
}

export function formatPrecio(n) {
  return '$' + Number(n).toLocaleString('es-AR')
}

export function getIniciales(nombre = '') {
  return nombre.trim().split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export function debounce(fn, delay = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function catLabel(c) {
  const map = { pan: 'Pan', facturas: 'Facturas', galletas: 'Galletas', cakes: 'Cakes', otro: 'Otro' }
  return map[c] || 'Otro'
}

export function catEmoji(c) {
  const map = { pan: '🍞', facturas: '🥐', galletas: '🍪', cakes: '🎂', otro: '✨' }
  return map[c] || '🛒'
}