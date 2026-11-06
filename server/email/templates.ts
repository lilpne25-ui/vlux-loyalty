// V0.4.5 · Plantilla de invitación (HTML para clientes de correo + texto plano). Diseño premium sobrio:
// tablas y estilos en línea (Gmail, Outlook y Apple Mail ignoran <style> y CSS moderno). Sin contraseñas.
export interface InvitationEmailData {
  businessName: string; inviteeName: string; role: 'OWNER' | 'EMPLOYEE'; link: string; expiresAt: Date; assetBase: string; supportEmail: string | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fmtDate = (d: Date) => d.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' });

export function invitationEmail(d: InvitationEmailData) {
  const owner = d.role === 'OWNER';
  const subject = owner ? `Activa tu panel de ${d.businessName} en VLUX Loyalty` : `Te invitaron a la caja de ${d.businessName} en VLUX Loyalty`;
  const what = owner
    ? 'Con tu panel verás a tus clientes y visitas, ajustarás tu programa de recompensas, descargarás el QR del mostrador y darás de alta a tu equipo.'
    : 'Con tu acceso podrás registrar compras y canjear recompensas desde la caja, escaneando la tarjeta del cliente.';
  const expires = fmtDate(d.expiresAt);
  const support = d.supportEmail ? `¿Dudas? Escríbenos a ${d.supportEmail}.` : 'Si tienes dudas, responde a quien te envió esta invitación.';
  const text = [
    `Hola, ${d.inviteeName}:`, '',
    `VLUX preparó el acceso de ${d.businessName} a VLUX Loyalty.`, what, '',
    `Activa tu cuenta aquí (enlace de un solo uso): ${d.link}`, '',
    `El enlace vence el ${expires} (hora del centro de México). Al abrirlo eliges tu propia contraseña: nunca te la enviaremos por correo.`,
    'Si no esperabas esta invitación, ignora este mensaje.', '', support, '', 'VLUX · AI Transformation Partner',
  ].join('\n');
  const logo = `${d.assetBase}/brand/vlux-logo-full.png`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#0B0D10;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(owner ? 'Tu panel de VLUX Loyalty está listo para activarse.' : 'Tu acceso a la caja está listo.')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0D10;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#14171C;border:1px solid #262B33;border-radius:16px;">
<tr><td style="padding:28px 32px 8px 32px;"><img src="${esc(logo)}" width="132" alt="VLUX" style="display:block;border:0;height:auto;max-width:132px;"></td></tr>
<tr><td style="padding:8px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#E9ECEF;">
<p style="margin:16px 0 4px 0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8A93A0;">VLUX Loyalty · ${owner ? 'Panel del propietario' : 'Acceso de caja'}</p>
<h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;font-weight:600;color:#FFFFFF;">${esc(d.businessName)}</h1>
<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;">Hola, ${esc(d.inviteeName)}:</p>
<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#C5CBD3;">${esc(what)}</p>
</td></tr>
<tr><td style="padding:12px 32px 4px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#67C7D3;">
<a href="${esc(d.link)}" style="display:inline-block;padding:14px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#0B0D10;text-decoration:none;border-radius:10px;">Activar mi cuenta</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:16px 32px 8px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#8A93A0;">
<p style="margin:0 0 8px 0;">El enlace es de un solo uso y vence el <strong style="color:#C5CBD3;">${esc(expires)}</strong> (hora del centro de México). Al abrirlo eliges tu propia contraseña: nunca te la enviaremos por correo.</p>
<p style="margin:0 0 8px 0;">Si el botón no funciona, copia este enlace en tu navegador:<br><span style="word-break:break-all;color:#C5CBD3;">${esc(d.link)}</span></p>
<p style="margin:0 0 8px 0;">Si no esperabas esta invitación, ignora este mensaje.</p>
</td></tr>
<tr><td style="padding:16px 32px 28px 32px;border-top:1px solid #262B33;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6B7380;">
${esc(support)}<br>VLUX · AI Transformation Partner
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, html, text };
}
