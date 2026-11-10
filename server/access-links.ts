// V0.4 · Los tres accesos de un negocio. Son direcciones, no credenciales: abrir la de caja o la del
// panel solo muestra el inicio de sesión propio del negocio (cookie HttpOnly, roles en el servidor).
// V0.4.6 · Caja, panel e inicio de sesión llevan ?negocio=<slug>: el enlace permanente identifica el negocio
// (para que una persona con varios negocios entre directo al correcto) pero NO lleva tokens ni contraseñas.
export interface AccessLinks { customerUrl: string; cashierUrl: string; ownerUrl: string; loginUrl: string; base: string }

export function accessLinks(base: string, slug: string): AccessLinks {
  const b = base.replace(/\/$/, '');
  const q = `?negocio=${encodeURIComponent(slug)}`;
  return { base: b, customerUrl: `${b}/n/${slug}`, cashierUrl: `${b}/caja${q}`, ownerUrl: `${b}/panel${q}`, loginUrl: `${b}/acceso${q}` };
}
