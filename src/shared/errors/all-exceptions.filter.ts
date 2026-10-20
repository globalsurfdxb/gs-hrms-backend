import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from './app-error.js';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

/* Every error leaves the API in the same shape. Unknown errors become a generic 500 — the cause is logged
   server-side with the request id, never sent to the client. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const body = this.toBody(exception);
    body.requestId = req.id;
    if (body.statusCode >= 500) this.logger.error({ err: exception, requestId: req.id }, 'Unhandled error');
    res.status(body.statusCode).json(body);
  }

  private toBody(e: unknown): ErrorBody {
    if (e instanceof AppError) return { statusCode: e.status, code: e.code, message: e.message, details: e.details };

    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse();
      // ValidationPipe puts the list of field errors in `message`.
      const message = typeof r === 'object' && r && 'message' in r ? (r as { message: unknown }).message : e.message;
      return {
        statusCode: status,
        code: status === 400 ? 'request.invalid' : `http.${status}`,
        message: Array.isArray(message) ? 'Request validation failed' : String(message),
        details: Array.isArray(message) ? { fields: message } : undefined,
      };
    }

    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002')
        return { statusCode: 409, code: 'record.duplicate', message: 'A record with these values already exists' };
      if (e.code === 'P2025') return { statusCode: 404, code: 'record.not_found', message: 'Record not found' };
      if (e.code === 'P2003')
        return { statusCode: 409, code: 'record.in_use', message: 'Record is referenced by other records' };
    }

    return { statusCode: 500, code: 'server.error', message: 'Something went wrong' };
  }
}
