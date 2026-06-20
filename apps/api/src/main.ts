import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
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
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') || 3000;
  await app.listen(port);
}

bootstrap();
