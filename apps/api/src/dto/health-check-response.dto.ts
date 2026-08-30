import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckResponseDto {
  @ApiProperty({ example: 'ok' })
  status: 'ok';

  @ApiProperty({
    description: 'API process uptime in seconds',
    example: 123.45,
  })
  uptime: number;

  @ApiProperty({
    description: 'Health check response time in ISO 8601 format',
    example: '2026-07-05T00:00:00.000Z',
  })
  timestamp: string;
}
