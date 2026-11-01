// Errores de negocio con código estable (para la UI) y estado HTTP.
export class AppError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429, public code: string, message: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} no encontrado.`);
export const forbidden = () => new AppError(403, 'forbidden', 'No tienes permiso para esta operación.');
export const unauthorized = () => new AppError(401, 'unauthorized', 'Inicia sesión para continuar.');
