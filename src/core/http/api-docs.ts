import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiResponse } from '@nestjs/swagger';

/* Swagger building blocks every controller uses, so the API docs read the same everywhere.
   Every route needs: @ApiOperation({ summary }) + a success response (@ApiOkResponse / @ApiCreatedResponse /
   @ApiNoContentResponse) + @ApiErrors(...) for the failures it can return. Enforced by
   test/docs/api-docs.e2e-spec.ts. */

/** The body of every error response (see AllExceptionsFilter). */
export class ErrorResponse {
  @ApiProperty({ example: 403 }) statusCode: number;
  @ApiProperty({ example: 'auth.forbidden', description: 'Stable code — the frontend switches on this' })
  code: string;
  @ApiProperty({ example: 'You do not have access to this' }) message: string;
  @ApiPropertyOptional({ description: 'Field errors for request.invalid', type: Object }) details?: unknown;
  @ApiPropertyOptional({ example: 'req-42', description: 'Quote this when reporting a problem' })
  requestId?: string;
}

const MEANING: Record<number, string> = {
  400: 'Invalid input (code `request.invalid`, field errors in `details.fields`) or a business rule failed',
  401: 'Not signed in, or the session expired',
  403: 'Signed in but not allowed (missing permission, or request from another origin)',
  404: 'Not found — or the caller is not allowed to know it exists',
  409: 'Conflict — duplicate value, record in use, or an invalid status change',
  429: 'Too many requests — slow down',
  500: 'Unexpected server error — details are in the server log; quote the requestId',
  503: 'Feature not configured yet',
};

/** Documents the error responses a route can return, with the shared ErrorResponse schema. */
export const ApiErrors = (...statuses: (keyof typeof MEANING)[]) =>
  applyDecorators(
    ...statuses.map((status) => ApiResponse({ status, description: MEANING[status], type: ErrorResponse })),
  );
