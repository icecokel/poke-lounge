import { NestFactory } from '@nestjs/core';
import { OpenAPIObject } from '@nestjs/swagger';
import { createApiDocument } from './api-documentation';
import { ApiContractModule } from './api-contract.module';

export const createLocalOpenApiDocument = async (): Promise<OpenAPIObject> => {
  const app = await NestFactory.create(ApiContractModule, {
    abortOnError: false,
    logger: false,
  });

  try {
    return createApiDocument(app);
  } finally {
    await app.close();
  }
};
