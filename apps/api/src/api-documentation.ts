import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response } from 'express';

const noCache = (_req: Request, res: Response, next: NextFunction) => {
  res.header(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  );
  res.header('Pragma', 'no-cache');
  res.header('Expires', '0');
  next();
};

const httpMethods = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

const wrapSuccessfulResponseSchemas = (document: OpenAPIObject): void => {
  Object.values(document.paths).forEach((path) => {
    httpMethods.forEach((method) => {
      const operation = path[method];

      if (!operation) {
        return;
      }

      Object.entries(operation.responses).forEach(([statusCode, response]) => {
        if (!response || !/^2\d\d$/.test(statusCode) || '$ref' in response) {
          return;
        }

        const mediaType = response.content?.['application/json'];

        if (!mediaType?.schema) {
          return;
        }

        mediaType.schema = {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: mediaType.schema,
          },
        };
      });
    });
  });
};

export const createApiDocument = (app: INestApplication): OpenAPIObject => {
  const config = new DocumentBuilder()
    .setTitle('Poke Lounge API')
    .setDescription('Poke Lounge API 문서입니다.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  wrapSuccessfulResponseSchemas(document);

  return document;
};

export const setupApiDocumentation = (app: INestApplication): void => {
  app.use('/api', noCache);
  app.use('/api-json', noCache);

  const document = createApiDocument(app);
  SwaggerModule.setup('api', app, document);
};
