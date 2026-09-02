import { createLocalOpenApiDocument } from '../../api-contract';

describe('PokeLoungeRoomResponseDto terminal transition contract', function testSuite() {
  let document: unknown;

  beforeAll(async function setUpTests() {
    document = await createLocalOpenApiDocument();
  });

  it('requires a bounded transition array while keeping current competitive assignment optional and non-null', function testCase() {
    const room = schema('PokeLoungeRoomResponseDto');
    const roomProperties = requireRecord(
      room.properties,
      'PokeLoungeRoomResponseDto.properties',
    );
    const transitions = requireSchema(
      roomProperties.competitiveTransitions,
      'PokeLoungeRoomResponseDto.competitiveTransitions',
    );
    const competitive = requireReference(
      roomProperties.competitive,
      'PokeLoungeRoomResponseDto.competitive',
    );
    const assignments = requireSchema(
      roomProperties.competitiveAssignments,
      'PokeLoungeRoomResponseDto.competitiveAssignments',
    );

    const required = requireStringArray(
      room.required,
      'PokeLoungeRoomResponseDto.required',
    );
    expect(required).toContain('competitiveTransitions');
    expect(required).toContain('competitiveAssignments');
    expect(required).not.toContain('competitive');
    expect(transitions).toMatchObject({
      type: 'array',
      maxItems: 8,
      items: {
        $ref: '#/components/schemas/CompetitiveTerminalTransitionDto',
      },
    });
    expect(competitive).toMatchObject({
      $ref: '#/components/schemas/CompetitiveActionResponseDto',
    });
    expect(competitive).not.toMatchObject({ nullable: true });
    expect(assignments).toMatchObject({
      type: 'array',
      maxItems: 3,
      items: {
        $ref: '#/components/schemas/CompetitiveActionResponseDto',
      },
    });
  });

  it('requires wrapper metadata and its completed action projection', function testCase() {
    const transition = schema('CompetitiveTerminalTransitionDto');
    const properties = requireRecord(
      transition.properties,
      'CompetitiveTerminalTransitionDto.properties',
    );

    expect(
      requireStringArray(
        transition.required,
        'CompetitiveTerminalTransitionDto.required',
      ),
    ).toEqual(
      expect.arrayContaining([
        'terminalEventId',
        'terminalRoomRevision',
        'projection',
      ]),
    );
    expect(properties).toMatchObject({
      terminalEventId: { type: 'string', format: 'uuid' },
      terminalRoomRevision: { type: 'number', minimum: 0 },
      projection: {
        $ref: '#/components/schemas/CompetitiveActionResponseDto',
      },
    });
  });

  it('requires the nullable host id and documents the host start mutation', function testCase() {
    const room = schema('PokeLoungeRoomResponseDto');
    const roomProperties = requireRecord(
      room.properties,
      'PokeLoungeRoomResponseDto.properties',
    );
    expect(
      requireStringArray(room.required, 'PokeLoungeRoomResponseDto.required'),
    ).toContain('hostPlayerId');
    expect(roomProperties.hostPlayerId).toMatchObject({
      type: 'string',
      nullable: true,
    });
    expect(
      requireStringArray(room.required, 'PokeLoungeRoomResponseDto.required'),
    ).toContain('visibility');
    expect(roomProperties.visibility).toMatchObject({
      type: 'string',
      enum: ['public', 'private'],
    });

    const documentRecord = requireRecord(document, 'OpenAPI document');
    const paths = requireRecord(documentRecord.paths, 'OpenAPI paths');
    const startPath = requireRecord(
      paths['/poke-lounge/rooms/{roomCode}/start'],
      'start path',
    );
    const post = requireRecord(startPath.post, 'start POST');
    const requestBody = requireRecord(post.requestBody, 'start request body');
    const content = requireRecord(requestBody.content, 'start request content');
    const json = requireRecord(content['application/json'], 'start JSON body');

    expect(json.schema).toEqual({
      $ref: '#/components/schemas/StartPokeLoungeRoomDto',
    });

    const quickPlayPath = requireRecord(
      paths['/poke-lounge/rooms/quick-play'],
      'quick-play path',
    );
    const quickPlayPost = requireRecord(quickPlayPath.post, 'quick-play POST');
    const quickPlayRequestBody = requireRecord(
      quickPlayPost.requestBody,
      'quick-play request body',
    );
    const quickPlayContent = requireRecord(
      quickPlayRequestBody.content,
      'quick-play request content',
    );
    const quickPlayJson = requireRecord(
      quickPlayContent['application/json'],
      'quick-play JSON body',
    );
    expect(quickPlayJson.schema).toEqual({
      $ref: '#/components/schemas/JoinPokeLoungeRoomDto',
    });
  });

  function schema(name: string): Record<string, unknown> {
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

  function requireReference(
    value: unknown,
    name: string,
  ): Record<string, unknown> {
    const reference = requireRecord(value, name);
    if (typeof reference.$ref !== 'string') {
      throw new Error(`Expected OpenAPI reference for ${name}`);
    }

    return reference;
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
