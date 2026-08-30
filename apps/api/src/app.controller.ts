import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { HealthCheckResponseDto } from './dto/health-check-response.dto';

/**
 * 애플리케이션의 루트 컨트롤러
 */
@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * 기본적인 Hello World 메시지를 반환함
   */
  @Get()
  @ApiOperation({ summary: '서버 상태 확인' })
  @ApiOkResponse({
    description: '서버가 정상적으로 동작 중임을 나타내는 메시지',
    schema: {
      type: 'string',
      example: 'Hello World!',
    },
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: 'API 헬스 체크' })
  @ApiOkResponse({
    description: 'API 프로세스가 정상적으로 요청을 처리할 수 있는 상태',
    type: HealthCheckResponseDto,
  })
  getHealth(): HealthCheckResponseDto {
    return this.appService.getHealth();
  }
}
