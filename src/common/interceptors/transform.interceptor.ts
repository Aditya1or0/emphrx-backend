import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T;
  meta?: unknown;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, StandardResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const statusCode = response.statusCode ?? 200;

    return next.handle().pipe(
      map((res) => {
        /* If response already contains data & meta pagination, preserve separation */
        if (res && typeof res === 'object' && 'data' in res && 'meta' in res) {
          return {
            success: true,
            statusCode,
            message: 'Operation completed successfully',
            data: res.data,
            meta: res.meta,
          };
        }

        /* If response provides a message field, lift it */
        const message =
          res && typeof res === 'object' && 'message' in res && typeof res.message === 'string'
            ? res.message
            : 'Operation completed successfully';

        return {
          success: true,
          statusCode,
          message,
          data: res,
        };
      }),
    );
  }
}
