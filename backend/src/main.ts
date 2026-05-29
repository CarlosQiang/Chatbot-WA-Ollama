import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug', 'verbose'],
  });

  // Helmet con configuración explícita:
  //  - crossOriginResourcePolicy desactivado: el frontend en :3410 consume
  //    la API en :3411, y CORP por defecto bloquea cross-origin.
  //  - contentSecurityPolicy desactivado en dev/Swagger: Swagger UI carga
  //    scripts inline; lo dejamos al frontend (Next) que ya aplica su CSP.
  //  - HSTS solo en producción y siempre tras un proxy TLS. En LAN sin
  //    HTTPS, HSTS rompe el dashboard.
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false,
      hsts:
        process.env.NODE_ENV === 'production' && process.env.ENABLE_HSTS === 'true'
          ? { maxAge: 15552000, includeSubDomains: true }
          : false,
    }),
  );

  const corsOrigin = (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((o) => o.trim());
  app.enableCors({
    origin: corsOrigin.includes('*') ? true : corsOrigin,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('Local AI Hub API')
    .setDescription('WhatsApp ↔ OpenWA ↔ Ollama internal API')
    .setVersion('0.1.0')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, doc);

  const port = parseInt(process.env.PORT || '3411', 10);
  await app.listen(port, '0.0.0.0');
  Logger.log(`🚀 Backend listening on :${port}  (Swagger: /api)`, 'Bootstrap');
}

bootstrap();
