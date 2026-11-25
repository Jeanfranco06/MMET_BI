import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { AuthService } from './auth.service';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);
export const ALLOWED_ROLES = 'allowedRoles';
export const Roles = (...roles: string[]) => SetMetadata(ALLOWED_ROLES, roles);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest();
    if (!isPublic && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const readCookie = (name: string) => String(request.headers.cookie || '').split(';').map((part: string) => part.trim()).find((part: string) => part.startsWith(`${name}=`))?.slice(name.length + 1);
      const cookieToken = decodeURIComponent(readCookie('mmet_csrf') || '');
      const headerToken = String(request.headers['x-csrf-token'] || '');
      const left = Buffer.from(cookieToken); const right = Buffer.from(headerToken);
      if (!left.length || left.length !== right.length || !timingSafeEqual(left, right)) throw new ForbiddenException('Token CSRF inválido o ausente.');
    }
    if (isPublic) return true;
    const cookie = String(request.headers.cookie || '').split(';').map((part: string) => part.trim()).find((part: string) => part.startsWith('mmet_session='));
    const token = cookie ? decodeURIComponent(cookie.slice('mmet_session='.length)) : undefined;
    request.user = await this.auth.authenticate(token);
    request.sessionToken = token;
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<string[]>(ALLOWED_ROLES, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest();
    return Boolean(request.user && roles.includes(request.user.rol));
  }
}
