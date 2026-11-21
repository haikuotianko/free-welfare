import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminPrincipal, AuthenticatedRequest } from './session.guard';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.admin as AdminPrincipal;
  },
);
