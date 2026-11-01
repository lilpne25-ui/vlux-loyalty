// V0.4 · Los tres accesos de un negocio. Son direcciones, no credenciales: abrir la de caja o la del
// panel solo muestra el inicio de sesión propio del negocio (cookie HttpOnly, roles en el servidor).
export interface AccessLinks { customerUrl: string; cashierUrl: string; ownerUrl: string; loginUrl: string; base: string }

export function accessLinks(base: string, slug: string): AccessLinks {
  const b = base.replace(/\/$/, '');
  return { base: b, customerUrl: `${b}/n/${slug}`, cashierUrl: `${b}/caja`, ownerUrl: `${b}/panel`, loginUrl: `${b}/acceso` };
}
