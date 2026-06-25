import { supabase } from './supabase.js'
import { toast }    from './utils.js'

document.getElementById('btn-np-guardar').addEventListener('click', async () => {
  const p1 = document.getElementById('np-pass').value
  const p2 = document.getElementById('np-pass2').value

  if (p1.length < 8) { toast('Mínimo 8 caracteres', 'err'); return }
  if (p1 !== p2)     { toast('Las contraseñas no coinciden', 'err'); return }

  const btn = document.getElementById('btn-np-guardar')
  btn.disabled = true; btn.textContent = 'Guardando...'

  const { error } = await supabase.auth.updateUser({ password: p1 })

  btn.disabled = false; btn.textContent = 'Guardar nueva contraseña'

  if (error) { toast('Error: ' + error.message, 'err'); return }

  toast('Contraseña actualizada ✓', 'ok')
  setTimeout(() => location.href = 'login.html', 1200)
})