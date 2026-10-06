import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errorName = 'InternalServerError';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        errorName = exception.name;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string) || exception.message;
        errorName = (obj.error as string) || exception.name;
        details = Array.isArray(obj.message) ? obj.message : undefined;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      errorName = exception.name;
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    response.status(status).send({
      success: false,
      statusCode: status,
      error: errorName,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
