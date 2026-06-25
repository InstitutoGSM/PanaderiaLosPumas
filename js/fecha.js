const hoy = new Date()
document.getElementById('fecha-actual').textContent = hoy.toLocaleDateString('es-AR')
document.getElementById('anio-actual').textContent  = hoy.getFullYear()