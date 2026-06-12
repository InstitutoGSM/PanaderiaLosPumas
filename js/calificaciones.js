import { supabase } from './supabase.js'
import { toast }    from './utils.js'
import { getUser }  from './auth.js'

export async function renderEstrellas(productoId, containerId) {
  const el = document.getElementById(containerId)
  if (!el) return

  const { data } = await supabase
    .from('calificaciones')
    .select('estrellas')
    .eq('producto_id', productoId)

  const total    = data?.length || 0
  const promedio = total > 0
    ? data.reduce((acc, c) => acc + c.estrellas, 0) / total
    : 0

  const user = await getUser()
  let miCal  = 0
  if (user) {
    const { data: mia } = await supabase
      .from('calificaciones')
      .select('estrellas')
      .eq('producto_id', productoId)
      .eq('comprador_id', user.id)
      .single()
    miCal = mia?.estrellas || 0
  }

  el.innerHTML = `
    <div class="estrellas-wrap" data-pid="${productoId}">
      <div class="estrellas-display" title="${promedio.toFixed(1)} / 5">
        ${renderStars(promedio)}
      </div>
      <span class="estrellas-count">
        ${total > 0 ? `${promedio.toFixed(1)} (${total})` : 'Sin calificaciones'}
      </span>
      ${user ? `
        <div class="estrellas-votar" title="Tu calificación">
          ${[1,2,3,4,5].map(n => `
            <button class="star-btn ${miCal >= n ? 'on' : ''}"
                    data-val="${n}" data-pid="${productoId}"
                    aria-label="${n} estrella${n > 1 ? 's' : ''}">★</button>
          `).join('')}
          ${miCal
            ? `<span style="font-size:0.72rem;color:var(--gris);margin-left:4px">
                 Tu voto: ${miCal}★
               </span>`
            : ''}
        </div>
      ` : `<span class="estrellas-hint">Iniciá sesión para calificar</span>`}
    </div>
  `

  el.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      const val = parseInt(btn.dataset.val)
      el.querySelectorAll('.star-btn').forEach(b =>
        b.classList.toggle('hover', parseInt(b.dataset.val) <= val))
    })
    btn.addEventListener('mouseleave', () =>
      el.querySelectorAll('.star-btn').forEach(b => b.classList.remove('hover')))
    btn.addEventListener('click', () =>
      calificar(productoId, parseInt(btn.dataset.val), containerId))
  })
}

async function calificar(productoId, estrellas, containerId) {
  const user = await getUser()
  if (!user) { toast('Iniciá sesión para calificar', 'err'); return }

  const { error } = await supabase
    .from('calificaciones')
    .upsert(
      { producto_id: productoId, comprador_id: user.id, estrellas },
      { onConflict: 'producto_id,comprador_id' }
    )

  if (error) { toast('Error al calificar', 'err'); return }
  toast('¡Gracias por tu calificación! ⭐', 'ok')
  renderEstrellas(productoId, containerId)
}

function renderStars(promedio) {
  return [1,2,3,4,5].map(n => {
    const llena = promedio >= n
    const media = !llena && promedio >= n - 0.5
    return `<span class="star ${llena ? 'full' : media ? 'half' : 'empty'}">★</span>`
  }).join('')
}

export async function promedioProducto(productoId) {
  const { data } = await supabase
    .from('calificaciones').select('estrellas').eq('producto_id', productoId)
  if (!data || data.length === 0) return null
  const prom = data.reduce((acc, c) => acc + c.estrellas, 0) / data.length
  return { promedio: prom, total: data.length }
}