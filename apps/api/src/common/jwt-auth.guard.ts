import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');
    const token = header.slice(7);
    try {
      req.user = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET || 'dev' });
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
