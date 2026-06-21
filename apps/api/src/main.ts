import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './config/validate-env';
import { JsonLogger } from './common/json-logger';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';

// ponytail: Prisma money fields are BigInt; Express JSON.stringify can't serialize them.
// Serialize all BigInt to string globally (matches wallet endpoints already returning strings).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  validateEnv(); // crash before listening if production secrets/config are missing or unsafe
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(new JsonLogger());
  // Security headers: removes X-Powered-By, adds nosniff / frame-deny / HSTS /
  // referrer-policy. CSP is off here — this is a JSON API (no HTML documents to
  // protect), and it keeps cross-origin API consumers unaffected.
  app.use(helmet({ contentSecurityPolicy: false }));
  // API responses are per-request and may be auth-scoped — never let them be cached.
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') || 3000;
  await app.listen(port);
}

bootstrap();
