import { ApiProperty } from '@nestjs/swagger';

const POKE_LOUNGE_ROM_DOCUMENT_KEYS = [
  'pokemon-data',
  'item-data',
  'level-up-move-table',
  'growth-table',
] as const;

export class PokeLoungeRomDocumentDto {
  @ApiProperty({ enum: POKE_LOUNGE_ROM_DOCUMENT_KEYS })
  documentKey!: (typeof POKE_LOUNGE_ROM_DOCUMENT_KEYS)[number];

  @ApiProperty({ example: 1, enum: [1] })
  schemaVersion!: 1;

  @ApiProperty({ pattern: '^[0-9a-f]{40}$' })
  romSha1!: string;

  @ApiProperty({ pattern: '^[0-9a-f]{64}$' })
  contentSha256!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  payload!: Record<string, unknown>;
}

export class PokeLoungeRomDataResponseDto {
  @ApiProperty({ type: [PokeLoungeRomDocumentDto], minItems: 4, maxItems: 4 })
  documents!: PokeLoungeRomDocumentDto[];
}
