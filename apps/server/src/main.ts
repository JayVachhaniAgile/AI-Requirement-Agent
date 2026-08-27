import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  const config = app.get(ConfigService);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.setGlobalPrefix('api');

  // CORS — allow only explicit origins (configurable via CORS_ORIGINS, comma-separated)
  // Default to local dev ports. In production, set CORS_ORIGINS to your real domain(s).
  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowAllOrigins = corsOrigins.length === 1 && corsOrigins[0] === '*';
  app.enableCors({
    origin: allowAllOrigins ? true : corsOrigins,
    credentials: !allowAllOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Api-Key'],
    maxAge: 86400,
  });

  // Security headers — defense in depth. CSP is intentionally permissive for the
  // SPA so inline mermaid/scripts keep working, but we still ban object/frame
  // embedding and disable the legacy XSS auditor.
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss:; frame-ancestors 'none';",
    );
    next();
  });

  // Lightweight per-IP rate limiter for expensive, user-triggered pipeline
  // operations (recompile / regenerate / gap-analysis). Prevents a single
  // client from flooding the LLM/DB with expensive jobs. In-memory only —
  // acceptable for a single-instance deployment; swap for a shared store
  // (Redis) when scaling horizontally.
  const heavyWindowRaw = Number(config.get<string>('HEAVY_RATE_LIMIT_WINDOW_MS') ?? 60_000);
  const heavyMaxRaw = Number(config.get<string>('HEAVY_RATE_LIMIT_MAX') ?? 10);
  const HEAVY_LIMIT = {
    windowMs: Number.isFinite(heavyWindowRaw) && heavyWindowRaw > 0 ? heavyWindowRaw : 60_000,
    max: Number.isFinite(heavyMaxRaw) && heavyMaxRaw > 0 ? heavyMaxRaw : 10,
  };
  const heavyHits = new Map<string, { count: number; resetAt: number }>();
  app.use((req: { ip?: string; path?: string; method?: string }, res: { status: (c: number) => { send: (b: unknown) => unknown } }, next: () => void) => {
    const isHeavy =
      req.method === 'POST' &&
      /\/api\/projects\/[^/]+\/(recompile|regenerate|gap-analysis|start|refine-idea)/.test(req.path ?? '');
    if (!isHeavy) return next();
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const entry = heavyHits.get(key);
    if (!entry || now >= entry.resetAt) {
      heavyHits.set(key, { count: 1, resetAt: now + HEAVY_LIMIT.windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > HEAVY_LIMIT.max) {
      res.status(429).send({ statusCode: 429, message: 'Too many requests — slow down' });
      return;
    }
    return next();
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`[NestJS] Server listening on port ${port}`);
}

bootstrap();
