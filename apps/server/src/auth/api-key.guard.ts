import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      path?: string;
      headers: Record<string, string | string[] | undefined>;
    }>();

    const path = req.path ?? '';
    // Public paths exempt from auth check
    if (path === '/api/health' || path === '/health' || path === '/') {
      return true;
    }

    const requireAuth =
      this.config.get<string>('REQUIRE_AUTH') === 'true' ||
      this.config.get<string>('NODE_ENV') === 'production';

    // If authentication is not strictly required in dev mode, pass through
    if (!requireAuth) {
      return true;
    }

    const expectedApiKey = this.config.get<string>('API_KEY');
    if (!expectedApiKey) {
      // Auth required but no API_KEY configured -> warn and pass in dev, fail in prod
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new UnauthorizedException('API key is required in production');
      }
      return true;
    }

    const authHeader = req.headers['authorization'];
    const apiKeyHeader = req.headers['x-api-key'];

    let providedKey: string | undefined;
    if (typeof apiKeyHeader === 'string') {
      providedKey = apiKeyHeader;
    } else if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      providedKey = authHeader.slice(7).trim();
    }

    if (!providedKey || providedKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}
