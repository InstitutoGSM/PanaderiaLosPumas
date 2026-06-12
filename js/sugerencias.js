import { debounce } from './utils.js'

export function initSugerencias(inputId, getFn) {
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
          ${item.sub
            ? `<div class="sug-sub">${item.sub}</div>`
            : ''}
        </div>
        ${item.precio
          ? `<span class="sug-precio">${item.precio}</span>`
          : ''}
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