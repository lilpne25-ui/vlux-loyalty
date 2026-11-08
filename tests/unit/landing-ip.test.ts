// 1.0.x · Correcciones de la revisión: URL de la landing comercial (VITE_VLUX_LANDING_URL) y agrupación IPv6 /64.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeLandingUrl, vluxLearnMoreLink } from '../../src/lib/support';
import { ipBucket } from '../../server/security';

test('L01: landing válida: https con dominio real; se agrega ?ref=tarjeta sin pisar uno existente', () => {
  assert.equal(safeLandingUrl('https://vlux.mx/loyalty'), 'https://vlux.mx/loyalty?ref=tarjeta');
  assert.equal(safeLandingUrl('  https://www.vlux.mx/?ref=qr '), 'https://www.vlux.mx/?ref=qr');
});

test('L02: landing rechazada: http, credenciales, puerto, IP, localhost, javascript:, relativa, larga o fuera de la lista', () => {
  for (const bad of ['http://vlux.mx', 'https://user:pw@vlux.mx', 'https://vlux.mx:8443/', 'https://192.168.0.10/', 'https://localhost/', 'https://equipo.local/',
    'javascript:alert(1)', '/?ref=tarjeta', '//vlux.mx', 'https://vlux', `https://vlux.mx/${'a'.repeat(200)}`, '', undefined, null]) {
    assert.equal(safeLandingUrl(bad as string), null, String(bad));
  }
  assert.equal(safeLandingUrl('https://otro.com/', 'vlux.mx,www.vlux.mx'), null);
  assert.equal(safeLandingUrl('https://www.vlux.mx/', 'vlux.mx, www.vlux.mx'), 'https://www.vlux.mx/?ref=tarjeta');
});

test('L03: sin landing configurada, «Conocer VLUX Loyalty» abre WhatsApp comercial de VLUX (nunca una ruta interna)', () => {
  const l = vluxLearnMoreLink('Café Lupita', null);
  assert.match(l, /^https:\/\/wa\.me\/527441452048\?text=/);
  assert.match(decodeURIComponent(l), /VLUX Loyalty en la tarjeta de Café Lupita/);
  assert.equal(vluxLearnMoreLink('X', 'https://vlux.mx/?ref=tarjeta'), 'https://vlux.mx/?ref=tarjeta');
});

test('I01: límite por red: IPv4 completa; IPv6 por prefijo /64 (rotar dentro de la red no evade el límite)', () => {
  assert.equal(ipBucket('201.141.5.7'), '201.141.5.7');
  assert.equal(ipBucket('::ffff:201.141.5.7'), '201.141.5.7');
  assert.equal(ipBucket('2806:10a6:1:2:aaaa:bbbb:cccc:1'), '2806:10a6:1:2::/64');
  assert.equal(ipBucket('2806:10a6:1:2:ffff::9'), '2806:10a6:1:2::/64');
  assert.equal(ipBucket('2806:10a6:0001:0002::1'), '2806:10a6:1:2::/64');
  assert.equal(ipBucket('2806:10a6::1'), '2806:10a6:0:0::/64');
  assert.notEqual(ipBucket('2806:10a6:1:3::1'), ipBucket('2806:10a6:1:2::1'));
});
