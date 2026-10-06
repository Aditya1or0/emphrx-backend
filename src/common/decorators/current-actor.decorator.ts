import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { RequestActor } from '../interfaces/request-actor.interface.js';

export interface CurrentActorOptions {
  requireUser?: boolean;
}

/* Custom decorator resolving request actor context from development headers or future auth */
export const CurrentActor = createParamDecorator(
  (
    options: CurrentActorOptions = { requireUser: true },
    ctx: ExecutionContext,
  ): RequestActor => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    const headers = request.headers;

    const orgId = headers['x-org-id'] as string | undefined;
    if (!orgId || orgId.trim() === '') {
      throw new BadRequestException('Missing required header: x-org-id');
    }

    const userId = (headers['x-actor-id'] || headers['x-employee-id']) as
      | string
      | undefined;

    if (options.requireUser !== false && (!userId || userId.trim() === '')) {
      throw new BadRequestException(
        'Missing required header: x-actor-id (or x-employee-id)',
      );
    }

    const role = (headers['x-actor-role'] as string | undefined) || undefined;

    return {
      orgId,
      userId: userId || '',
      role,
    };
  },
);
