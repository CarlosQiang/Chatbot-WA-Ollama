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

  app.use(helmet({ crossOriginResourcePolicy: false }));

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
