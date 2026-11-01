// V0.3 · Google Wallet (tarjetas de lealtad) · PREPARACIÓN. Estado: NO configurado.
// Sin cuenta de emisor ni service account reales, este módulo solo construye y firma los objetos;
// no se ha probado contra la API de Google. No declarar "funciona" hasta pasar la prueba K con credenciales.
//
// Credenciales esperadas (variables de entorno, NUNCA en el repositorio):
//   GOOGLE_WALLET_ISSUER_ID            id numérico del emisor (Google Pay & Wallet Console)
//   GOOGLE_WALLET_SA_EMAIL             correo de la service account con acceso al emisor
//   GOOGLE_WALLET_SA_PRIVATE_KEY       llave privada PEM de esa service account
//   GOOGLE_WALLET_ORIGINS              orígenes permitidos para el botón (coma), p. ej. https://app.vlux.mx
//   GOOGLE_WALLET_MODE                 demo | production (por omisión demo)
import { createSign } from 'node:crypto';
import { type WalletCardSnapshot, type WalletProvider, type WalletStatus, WalletNotConfiguredError } from './provider';

const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';
const SAVE_URL = 'https://pay.google.com/gp/v/save/';

export interface GoogleWalletConfig { issuerId: string; saEmail: string; privateKeyPem: string; origins: string[]; mode: 'demo' | 'production' }

export function googleConfigFromEnv(env = process.env): { config: GoogleWalletConfig | null; missing: string[] } {
  const need = { GOOGLE_WALLET_ISSUER_ID: env.GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_SA_EMAIL: env.GOOGLE_WALLET_SA_EMAIL, GOOGLE_WALLET_SA_PRIVATE_KEY: env.GOOGLE_WALLET_SA_PRIVATE_KEY };
  const missing = Object.entries(need).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { config: null, missing };
  return {
    missing: [],
    config: {
      issuerId: need.GOOGLE_WALLET_ISSUER_ID!, saEmail: need.GOOGLE_WALLET_SA_EMAIL!,
      privateKeyPem: need.GOOGLE_WALLET_SA_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      origins: (env.GOOGLE_WALLET_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
      mode: env.GOOGLE_WALLET_MODE === 'production' ? 'production' : 'demo',
    },
  };
}

/** Los ids de Google Wallet son "<issuerId>.<sufijo>"; el sufijo admite letras, números, '.', '_' y '-'. */
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');
export const classIdFor = (issuerId: string, businessId: string) => `${issuerId}.vlux_${safe(businessId)}`;
export const objectIdFor = (issuerId: string, cardId: string) => `${issuerId}.card_${safe(cardId)}`;

export function buildLoyaltyClass(cfg: Pick<GoogleWalletConfig, 'issuerId'>, c: WalletCardSnapshot) {
  return {
    id: classIdFor(cfg.issuerId, c.business.id),
    issuerName: 'VLUX',
    programName: c.business.name,
    // programLogo es obligatorio: si el negocio no tiene logo se usa su ícono PWA público (512 px).
    programLogo: { sourceUri: { uri: c.business.logoUrl }, contentDescription: { defaultValue: { language: 'es-MX', value: c.business.name } } },
    hexBackgroundColor: c.business.primaryColor,
    reviewStatus: 'UNDER_REVIEW',
    countryCode: 'MX',
    multipleDevicesAndHoldersAllowedStatus: 'ONE_USER_ALL_DEVICES',
  };
}

export function buildLoyaltyObject(cfg: Pick<GoogleWalletConfig, 'issuerId'>, c: WalletCardSnapshot) {
  return {
    id: objectIdFor(cfg.issuerId, c.cardId),
    classId: classIdFor(cfg.issuerId, c.business.id),
    state: 'ACTIVE',
    accountId: c.publicCode,
    accountName: c.customerName.slice(0, 20), // Google recomienda ≤ 20 caracteres
    // El mismo código que ya lee la caja: el pase no introduce un segundo identificador.
    barcode: { type: 'QR_CODE', value: c.publicCode, alternateText: c.publicCode },
    // label ≤ 9 y balance ≤ 7 caracteres: se usa el número entero; la meta va en un módulo de texto.
    loyaltyPoints: { label: 'Sellos', balance: { int: c.balance } },
    textModulesData: [
      { id: 'goal', header: 'Meta', body: `${c.balance} de ${c.stampsRequired} sellos` },
      { id: 'reward', header: c.rewardReady ? 'Premio listo' : 'Premio', body: c.rewardDescription },
    ],
    linksModuleData: { uris: [{ id: 'web', uri: c.cardUrl, description: 'Ver mi tarjeta' }] },
  };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
function signRs256(claims: Record<string, unknown>, pem: string) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(claims));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(pem);
  return `${head}.${body}.${b64url(sig)}`;
}

/** JWT "savetowallet": clase + objeto embebidos (Google también acepta referenciar objetos ya insertados por REST). */
export function buildSaveJwt(cfg: GoogleWalletConfig, c: WalletCardSnapshot, now = Math.floor(Date.now() / 1000)) {
  return signRs256({
    iss: cfg.saEmail, aud: 'google', typ: 'savetowallet', iat: now, origins: cfg.origins,
    payload: { loyaltyClasses: [buildLoyaltyClass(cfg, c)], loyaltyObjects: [buildLoyaltyObject(cfg, c)] },
  }, cfg.privateKeyPem);
}

/** Token OAuth de la service account (flujo JWT bearer) para la API REST de actualización. */
async function accessToken(cfg: GoogleWalletConfig) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signRs256({ iss: cfg.saEmail, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, cfg.privateKeyPem);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!r.ok) throw new Error(`Google OAuth respondió ${r.status}`);
  return ((await r.json()) as { access_token: string }).access_token;
}

export class GoogleWalletProvider implements WalletProvider {
  readonly id = 'google' as const;
  constructor(private cfg: GoogleWalletConfig | null, private missing: string[] = []) {}
  static fromEnv() { const { config, missing } = googleConfigFromEnv(); return new GoogleWalletProvider(config, missing); }
  status(): WalletStatus {
    return this.cfg ? { provider: 'google', state: 'configured', mode: this.cfg.mode } : { provider: 'google', state: 'not_configured', missing: this.missing };
  }
  private need() { if (!this.cfg) throw new WalletNotConfiguredError('Google', this.missing); return this.cfg; }
  async saveLink(c: WalletCardSnapshot) { return SAVE_URL + buildSaveJwt(this.need(), c); }
  async pushUpdate(c: WalletCardSnapshot) {
    const cfg = this.need();
    const obj = buildLoyaltyObject(cfg, c);
    const r = await fetch(`${API}/loyaltyObject/${encodeURIComponent(obj.id)}`, {
      method: 'PATCH', headers: { authorization: `Bearer ${await accessToken(cfg)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ loyaltyPoints: obj.loyaltyPoints, textModulesData: obj.textModulesData, state: obj.state }),
    });
    // 404 = el cliente aún no guardó el pase: no es error para la tarjeta web.
    if (!r.ok && r.status !== 404) throw new Error(`Google Wallet respondió ${r.status}`);
  }
}
