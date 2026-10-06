import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: true,
    }),
  );

  app.setGlobalPrefix('api');

  /* Global validation pipe */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  /* Global response transformation and error handling filters */
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  /* Configure Swagger OpenAPI documentation */
  const config = new DocumentBuilder()
    .setTitle('EmpHrx Attendance API')
    .setDescription(
      'Multi-method attendance ingestion engine supporting dynamic QR, geofencing, biometrics, and manual rollups.',
    )
    .setVersion('2.0.0')
    .addApiKey({ type: 'apiKey', name: 'x-org-id', in: 'header' }, 'x-org-id')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
}

bootstrap();
