// V0.3 · Apple Wallet · SOLO ARQUITECTURA. No hay certificados de Apple (no se contrató Apple Developer).
// Este proveedor siempre reporta "no configurado". Ver docs/V03_APPLE_WALLET.md.
import { type WalletProvider, type WalletStatus, WalletNotConfiguredError } from './provider';

const REQUIRED = ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT_PEM', 'APPLE_PASS_KEY_PEM', 'APPLE_WWDR_CERT_PEM'];

export class AppleWalletProvider implements WalletProvider {
  readonly id = 'apple' as const;
  private missing = REQUIRED.filter((k) => !process.env[k]);
  status(): WalletStatus { return { provider: 'apple', state: 'not_configured', missing: this.missing.length ? this.missing : ['implementación (solo arquitectura en V0.3)'] }; }
  async saveLink(): Promise<string> { throw new WalletNotConfiguredError('Apple', this.status().state === 'not_configured' ? (this.status() as { missing: string[] }).missing : []); }
  async pushUpdate(): Promise<void> { /* sin pases emitidos: nada que actualizar */ }
}
