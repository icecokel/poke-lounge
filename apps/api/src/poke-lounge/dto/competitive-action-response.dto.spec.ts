import { createLocalOpenApiDocument } from '../../api-contract';

describe('CompetitiveActionResponseDto contract', () => {
  let document: unknown;

  beforeAll(async () => {
    document = await createLocalOpenApiDocument();
  });

  it('requires the server turn deadline and nullable terminal metadata', () => {
    const schema = getSchema('CompetitiveActionResponseDto');
    const properties = requireRecord(
      schema.properties,
      'CompetitiveActionResponseDto.properties',
    );

    expect(
      requireStringArray(
        schema.required,
        'CompetitiveActionResponseDto.required',
      ),
    ).toEqual(
      expect.arrayContaining([
        'turnEndsAtMs',
        'terminalEventId',
        'terminalRoomRevision',
      ]),
    );
    expect(properties).toMatchObject({
      turnEndsAtMs: {
        type: 'number',
        minimum: 0,
      },
      terminalEventId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
      },
      terminalRoomRevision: {
        type: 'number',
        minimum: 0,
        nullable: true,
      },
    });
  });

  it('keeps the ranked score and terminal result schema unchanged', () => {
    const terminal = getSchema('CompetitiveTerminalResultDto');
    const scoreByPlayerId = requireSchema(
      requireRecord(
        terminal.properties,
        'CompetitiveTerminalResultDto.properties',
      ).scoreByPlayerId,
      'CompetitiveTerminalResultDto.scoreByPlayerId',
    );

    expect(scoreByPlayerId).toMatchObject({
      type: 'object',
      additionalProperties: { type: 'number', enum: [50, 100] },
    });
  });

  function getSchema(name: string): Record<string, unknown> {
    const documentRecord = requireRecord(document, 'OpenAPI document');
    const components = requireRecord(
      documentRecord.components,
      'OpenAPI components',
    );
    const schemas = requireRecord(
      components.schemas,
      'OpenAPI component schemas',
    );

    return requireSchema(schemas[name], name);
  }

  function requireSchema(
    value: unknown,
    name: string,
  ): Record<string, unknown> {
    const schema = requireRecord(value, name);
    if (typeof schema.$ref === 'string') {
      throw new Error(`Expected inline OpenAPI schema for ${name}`);
    }

    return schema;
  }

  function requireRecord(
    value: unknown,
    name: string,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Expected object for ${name}`);
    }

    return value as Record<string, unknown>;
  }

  function requireStringArray(value: unknown, name: string): string[] {
    if (!Array.isArray(value)) {
      throw new Error(`Expected string array for ${name}`);
    }

    const items: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string') {
        throw new Error(`Expected string array for ${name}`);
      }
      items.push(item);
    }

    return items;
  }
});
