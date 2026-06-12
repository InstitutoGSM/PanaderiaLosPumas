export function generarTicketHTML(pedido) {
  const ticketId = pedido.ticket_id ||
    'TK-' + (pedido.id?.slice(-8) || 'XXXXXXXX').toUpperCase()

  const fecha = pedido.created_at
    ? new Date(pedido.created_at).toLocaleString('es-AR')
    : new Date().toLocaleString('es-AR')

  const items = (pedido.items || [])
    .map(i => `
      <tr>
        <td>${i.nombre}</td>
        <td style="text-align:center">${i.variante || 'unidad'}</td>
        <td style="text-align:center">${i.cantidad}</td>
        <td style="text-align:right">$${Number(i.precio).toLocaleString('es-AR')}</td>
        <td style="text-align:right">$${Number(i.precio * i.cantidad).toLocaleString('es-AR')}</td>
      </tr>
    `).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ticket ${ticketId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', monospace;
      background: #f5f5f5;
      display: flex; justify-content: center;
      padding: 40px 20px;
    }
    .ticket {
      background: white;
      width: 100%; max-width: 480px;
      padding: 36px 32px;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.1);
    }
    .ticket-header { text-align: center; margin-bottom: 24px; }
    .ticket-logo   { font-size: 2.5rem; margin-bottom: 6px; }
    .ticket-marca  { font-size: 1.4rem; font-weight: 900;
                     color: #C8601A; letter-spacing: 0.1em; }
    .ticket-sub    { font-size: 0.8rem; color: #7A6A5A; margin-top: 2px; }
    .divider {
      border: none; border-top: 2px dashed #EDD9B8;
      margin: 18px 0;
    }
    .ticket-id {
      text-align: center; font-size: 1.1rem;
      font-weight: 900; color: #3B1A0A;
      background: #F5ECD7; padding: 10px;
      border-radius: 8px; margin-bottom: 18px;
      letter-spacing: 0.15em;
    }
    .info-row {
      display: flex; justify-content: space-between;
      font-size: 0.82rem; margin-bottom: 6px;
    }
    .info-label { color: #7A6A5A; }
    .info-val   { font-weight: 700; color: #3B1A0A; }
    table {
      width: 100%; border-collapse: collapse;
      font-size: 0.82rem; margin-top: 8px;
    }
    th {
      background: #3B1A0A; color: white;
      padding: 8px 6px; text-align: left;
      font-size: 0.75rem;
    }
    td { padding: 7px 6px; border-bottom: 1px solid #F5ECD7; }
    tr:last-child td { border-bottom: none; }
    .total-row {
      display: flex; justify-content: space-between;
      align-items: center; margin-top: 16px;
      padding-top: 16px; border-top: 2px solid #3B1A0A;
    }
    .total-label { font-size: 1rem; font-weight: 700; }
    .total-val   { font-size: 1.5rem; font-weight: 900; color: #2D7A4F; }
    .estado-badge {
      display: inline-block; padding: 4px 12px;
      border-radius: 50px; font-size: 0.75rem;
      font-weight: 700; text-transform: uppercase;
      background: #FFF8E1; color: #F57F17;
    }
    .ticket-footer {
      text-align: center; margin-top: 24px;
      font-size: 0.75rem; color: #7A6A5A;
      line-height: 1.6;
    }
    .btn-print {
      display: block; width: 100%;
      margin-top: 24px; padding: 13px;
      background: #C8601A; color: white;
      border: none; border-radius: 8px;
      font-size: 1rem; font-weight: 700;
      cursor: pointer; letter-spacing: 0.04em;
    }
    @media print {
      body { background: white; padding: 0; }
      .ticket { box-shadow: none; border-radius: 0; }
      .btn-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="ticket-header">
      <div class="ticket-logo">🥖</div>
      <div class="ticket-marca">PanaderiaMarket</div>
      <div class="ticket-sub">Comprobante de pedido</div>
    </div>

    <div class="ticket-id">${ticketId}</div>

    <div class="info-row">
      <span class="info-label">Fecha</span>
      <span class="info-val">${fecha}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Comprador</span>
      <span class="info-val">${pedido.nombre_comprador || '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Email</span>
      <span class="info-val">${pedido.email_comprador || '—'}</span>
    </div>
    ${pedido.direccion ? `
    <div class="info-row">
      <span class="info-label">Dirección</span>
      <span class="info-val">${pedido.direccion}</span>
    </div>` : ''}
    <div class="info-row">
      <span class="info-label">Medio de pago</span>
      <span class="info-val">${pedido.medio_pago || '—'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Estado</span>
      <span class="estado-badge">${pedido.estado || 'pendiente'}</span>
    </div>

    <hr class="divider">

    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th style="text-align:center">Variante</th>
          <th style="text-align:center">Cant.</th>
          <th style="text-align:right">Precio</th>
          <th style="text-align:right">Subtotal</th>
        </tr>
      </thead>
      <tbody>${items}</tbody>
    </table>

    <div class="total-row">
      <span class="total-label">Total pagado</span>
      <span class="total-val">$${Number(pedido.total).toLocaleString('es-AR')}</span>
    </div>

    ${pedido.notas ? `
    <hr class="divider">
    <div style="font-size:0.82rem;color:#7A6A5A">
      <strong>Notas:</strong> ${pedido.notas}
    </div>` : ''}

    <hr class="divider">
    <div class="ticket-footer">
      Presentá este ticket al retirar tu pedido<br>
      Gracias por comprar en PanaderiaMarket 🥐
    </div>

    <button class="btn-print" onclick="window.print()">
      🖨️ Guardar / Imprimir PDF
    </button>
  </div>
</body>
</html>`
}

export function abrirTicket(pedido) {
  const html    = generarTicketHTML(pedido)
  const ventana = window.open('', '_blank')
  if (!ventana) {
    alert('Habilitá los popups para ver el ticket')
    return
  }
  ventana.document.write(html)
  ventana.document.close()
}