// V0.3 · Capa de Wallet desacoplada del motor de lealtad.
// Regla: la tarjeta web (BD + motor de sellos) es la ÚNICA fuente de verdad. Un proveedor de Wallet
// solo RECIBE una instantánea ya calculada y la representa; nunca calcula sellos ni premios.

/** Instantánea de una tarjeta lista para representarse en una cartera digital. */
export interface WalletCardSnapshot {
  cardId: string;              // uuid interno (estable)
  publicCode: string;          // código que lee la caja (QR/código de barras)
  customerName: string;
  balance: number;             // sellos actuales (calculados por el motor)
  stampsRequired: number;
  rewardDescription: string;
  rewardReady: boolean;
  business: { id: string; slug: string; name: string; city: string; primaryColor: string; accentColor: string; logoUrl: string };  // URL pública https (logo o ícono PWA del negocio)
  cardUrl: string;             // URL de la tarjeta web (respaldo y fuente de verdad)
}

export type WalletStatus =
  | { provider: 'google' | 'apple'; state: 'not_configured'; missing: string[] }
  | { provider: 'google' | 'apple'; state: 'configured'; mode: 'demo' | 'production' };

export interface WalletProvider {
  readonly id: 'google' | 'apple';
  status(): WalletStatus;
  /** Enlace "Agregar a Wallet" para una tarjeta. Lanza si el proveedor no está configurado. */
  saveLink(card: WalletCardSnapshot): Promise<string>;
  /** Empuja la instantánea nueva al pase ya guardado (tras una compra, canje o cambio de programa). */
  pushUpdate(card: WalletCardSnapshot): Promise<void>;
}

export class WalletNotConfiguredError extends Error {
  constructor(public provider: string, public missing: string[]) {
    super(`${provider} Wallet no está configurado (falta: ${missing.join(', ')}).`);
  }
}
