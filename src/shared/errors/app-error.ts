/* The one error type business code throws. The global exception filter turns it into a JSON response with a stable
   machine-readable `code` the frontend can switch on. Never throw raw strings or leak internal details in `message`. */
export class AppError extends Error {
  constructor(
    /** Stable, dot-separated code: `<entity>.<problem>`, e.g. `company.short_code_taken`. */
    readonly code: string,
    message: string,
    readonly status: number = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (entity: string) => new AppError(`${entity}.not_found`, `${entity} not found`, 404);
export const conflict = (code: string, message: string) => new AppError(code, message, 409);
export const forbidden = (code = 'auth.forbidden', message = 'You do not have access to this') =>
  new AppError(code, message, 403);
