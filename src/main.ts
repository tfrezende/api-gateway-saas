import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';
import { appConfig } from './config/app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  app.use(json({ limit: '1mb' }));

  const { origins } = appConfig.cors;
  if (origins.length > 0) {
    app.enableCors({
      origin: origins,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
      credentials: true,
    });
  }

  await app.listen(appConfig.port);
}
void bootstrap();
