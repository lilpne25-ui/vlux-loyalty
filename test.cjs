const { chromium } = require('playwright');
const fs = require('fs');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + fs.readFileSync('dist/index.html','utf8') + '</body></html>';
fs.writeFileSync('dist/test.html', html);
const results = [];
const ok = (n, cond, info='') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${n} ${info}`); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type()==='error' && !/fonts/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:8765/test.html');
  await page.waitForSelector('text=Tu café favorito ahora tiene recompensas.');
  await page.screenshot({ path: 'shots/01-welcome.png', fullPage: true });
  await page.click('text=Obtener mi tarjeta gratis');
  await page.fill('#reg-name', 'Prueba Demo');
  await page.fill('#reg-contact', '7221234567');
  await page.screenshot({ path: 'shots/02-register.png', fullPage: true });
  await page.click('button:has-text("Crear mi tarjeta")');
  await page.waitForSelector('text=Muestra este código en caja');
  const cardId = (await page.locator('.select-all').first().textContent()).trim();
  await page.screenshot({ path: 'shots/03-card.png', fullPage: true });
  // QR image for scan test
  await page.locator('svg[aria-label^="Código QR de la tarjeta"]').screenshot({ path: 'shots/qr.png' });

  // P1
  await page.click('[role=tab]:has-text("Soy dueño")');
  await page.click('text=Clientes y actividad');
  ok('P1 cliente aparece en panel', await page.locator(`text=${cardId}`).count() > 0, cardId);

  // P2 employee identify by scan photo
  await page.click('[role=tab]:has-text("Soy empleado")');
  await page.click('[role=tab]:has-text("Escanear")');
  await page.setInputFiles('#scan-file', 'shots/qr.png');
  await page.waitForTimeout(800);
  const scanned = await page.locator(`h2:has-text("Prueba Demo")`).count();
  ok('P2a identificar por foto de QR', scanned > 0);
  await page.click('[role=tab]:has-text("Escribir ID")');
  await page.fill('#manual-id', cardId.replace(/-/g,'').toLowerCase());
  await page.click('button:has-text("Buscar tarjeta")');
  ok('P2b identificar por ID manual', await page.locator(`h2:has-text("Prueba Demo")`).count() > 0);
  await page.click('button:has-text("Registrar visita y agregar sello")');
  await page.waitForTimeout(900);
  ok('P2c visita registrada', await page.locator('text=Sello agregado a Prueba Demo').count() > 0);
  await page.click('button:has-text("Registrar visita y agregar sello")');
  await page.waitForTimeout(300);
  ok('Duplicado bloqueado', await page.locator('text=Para evitar duplicados').count() > 0);
  await page.screenshot({ path: 'shots/04-employee.png', fullPage: true });

  // P3
  await page.click('[role=tab]:has-text("Soy cliente")');
  await page.waitForTimeout(400);
  const t = await page.locator('text=de 8 sellos').first().textContent();
  ok('P3 cliente ve nuevo sello', /1 de 8/.test(t) && await page.locator('text=¡Nuevo sello en tu tarjeta!').count() > 0, t);
  // P4
  await page.click('[role=tab]:has-text("Soy dueño")');
  const liveVisits = await page.locator('text=en vivo durante esta demo').nth(1).textContent();
  ok('P4 panel refleja operación', /^1 en vivo/.test(liveVisits), liveVisits);

  // second visit -> review prompt (test mode)
  await page.click('[role=tab]:has-text("Soy empleado")');
  await page.click('label[for=test-mode]');
  await page.click('button:has-text("Simular visita adicional")');
  await page.waitForTimeout(800);
  await page.click('[role=tab]:has-text("Soy cliente")');
  await page.waitForTimeout(300);
  ok('Invitación a reseña tras 2a visita', await page.locator('text=Compartir mi experiencia en Google').count() > 0);
  await page.click('[role=tab]:has-text("Soy dueño")');
  ok('Métrica invitaciones en vivo = 1', /^1 en vivo/.test(await page.locator('text=en vivo durante esta demo').nth(5).textContent()));

  // P5
  await page.click('[role=tab]:has-text("Soy empleado")');
  await page.click('button:has-text("Completar hasta la recompensa")');
  await page.waitForTimeout(500);
  ok('P5 recompensa habilitada (empleado)', await page.locator('text=Recompensa disponible').count() > 0);
  await page.click('[role=tab]:has-text("Soy cliente")');
  await page.waitForTimeout(1600);
  ok('P5 celebración cliente', await page.locator('text=¡Felicidades! Tu próxima bebida va por nuestra cuenta.').count() > 0);
  await page.screenshot({ path: 'shots/05-celebrate.png' });
  await page.click('button:has-text("Ver mi recompensa")');
  await page.waitForTimeout(400);
  const code = (await page.locator('.font-mono.select-all').last().textContent()).trim();
  await page.screenshot({ path: 'shots/06-reward.png' });
  await page.keyboard.press('Escape');

  // P6
  await page.click('[role=tab]:has-text("Soy empleado")');
  await page.click('button:has-text("Confirmar canje")');
  await page.click('button:has-text("Sí, canjear")');
  await page.waitForTimeout(400);
  ok('P6 canje confirmado', await page.locator('text=Canje confirmado').count() > 0);
  ok('P6 botón de canje ya no aparece', await page.locator('button:has-text("Confirmar canje")').count() === 0);
  await page.fill('#redeem-code', code);
  await page.click('button:has-text("Validar")');
  ok('P6 código no reutilizable', await page.locator('text=No puede usarse otra vez').count() > 0, code);
  // P7
  const cyc = await page.locator('text=Ciclo 2').count();
  await page.click('button:has-text("Simular visita adicional")');
  await page.waitForTimeout(800);
  await page.click('[role=tab]:has-text("Soy cliente")');
  await page.waitForTimeout(300);
  ok('P7 nuevo ciclo', cyc > 0 && /1 de 8/.test(await page.locator('text=de 8 sellos').first().textContent()));
  await page.screenshot({ path: 'shots/07-newcycle.png', fullPage: true });

  // P8
  await page.click('[role=tab]:has-text("Soy dueño")');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'shots/08-owner.png', fullPage: true });
  await page.click('text=Configuración');
  await page.fill('#set-stamps', '5');
  await page.fill('#set-reward', 'Un pan dulce de cortesía');
  await page.fill('#set-name', 'Café Demo Metepec');
  await page.click('button:has-text("Guardar cambios")');
  await page.waitForTimeout(300);
  await page.click('[role=tab]:has-text("Soy cliente")');
  await page.waitForTimeout(300);
  const t8 = await page.locator('text=de 5 sellos').count();
  ok('P8 cliente refleja regla nueva', t8 > 0 && await page.locator('text=Un pan dulce de cortesía').count() > 0 && await page.locator('text=Café Demo Metepec').count() > 0);
  // P9 overflow on every view
  for (const v of ['cliente','empleado','dueno','negocio']) {
    await page.evaluate(v => location.hash = v, v);
    await page.waitForTimeout(300);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`P9 sin scroll horizontal (${v})`, over <= 0, String(over));
    await page.screenshot({ path: `shots/m-${v}.png`, fullPage: true });
  }
  // P10 reload
  await page.reload();
  await page.evaluate(() => location.hash = 'cliente');
  await page.waitForTimeout(400);
  ok('P10 persistencia tras recargar', await page.locator('text=Prueba Demo').count() > 0 && await page.locator('text=de 5 sellos').count() > 0);
  // Wallet preview
  await page.click('button:has-text("Apple Wallet")');
  ok('Wallet: vista previa sin afirmar instalación', await page.locator('text=El pase no se agregó a tu teléfono.').count() > 0);
  await page.screenshot({ path: 'shots/09-wallet.png' });
  await page.keyboard.press('Escape');
  // desktop shots
  const d = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await d.goto('http://localhost:8765/test.html#dueno');
  await d.waitForTimeout(600);
  await d.screenshot({ path: 'shots/d-owner.png', fullPage: true });
  await d.goto('http://localhost:8765/test.html#empleado'); await d.waitForTimeout(500);
  await d.screenshot({ path: 'shots/d-employee.png', fullPage: true });
  await d.goto('http://localhost:8765/test.html#negocio'); await d.waitForTimeout(500);
  await d.screenshot({ path: 'shots/d-negocio.png', fullPage: true });
  console.log(results.join('\n'));
  console.log('ERRORS:', errors);
  await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(1); });
