import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorMessage } from '../constants/message.constant';
import { createApiRequestLog } from '../logging/api-request-log';
import { redactSensitiveValue } from '../utils/redact-sensitive';

/**
 * 전역 예외 필터: 발생하는 모든 예외를 캡처하여 일관된 형식의 응답을 반환함
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  /**
   * 예외 발생 시 호출되는 메서드
   */
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // HTTP 상태 코드 결정
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 에러 메시지 추출
    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : ErrorMessage.COMMON.INTERNAL_SERVER_ERROR;

    const errorResponse =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      !Array.isArray(exceptionResponse)
        ? exceptionResponse
        : { message: exceptionResponse };

    const accessLog = createApiRequestLog(request, status);
    const errorLog = JSON.stringify({ ...accessLog, event: 'api.error' });

    // 로깅 처리 (500번대 에러는 error로, 그 외는 warn으로 기록)
    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error(
        errorLog,
        exception instanceof Error
          ? String(redactSensitiveValue(exception.stack ?? exception.message))
          : JSON.stringify(redactSensitiveValue(exception)),
      );

      // 알림 전송 (Fire-and-forget)
      this.sendNotification(request, exception).catch(
        function handleRejected(this: HttpExceptionFilter, err: unknown): void {
          const errorMessage = err instanceof Error ? err.message : String(err);
          this.logger.error(`Failed to send notification: ${errorMessage}`);
        }.bind(this),
      );
    } else {
      this.logger.warn(errorLog);
    }

    // 통일된 JSON 형식으로 에러 응답 반환
    response.status(status).json({
      ...errorResponse,
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  /**
   * 알림 서비스를 통해 상세한 에러 정보를 전송합니다.
   */
  private async sendNotification(request: Request, exception: unknown) {
    const notifyUrl = process.env.NOTIFY_SERVICE_URL;
    const notifyUser = process.env.NOTIFY_SERVICE_USER;
    const notifyPassword = process.env.NOTIFY_SERVICE_PASSWORD;

    if (!notifyUrl || !notifyUser || !notifyPassword) {
      return;
    }

    // 에러 상세 정보 추출
    const errorMessage = String(
      redactSensitiveValue(
        exception instanceof Error ? exception.message : String(exception),
      ),
    );
    const stackTrace = String(
      redactSensitiveValue(
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : 'No stack trace available',
      ),
    );

    // 요청 정보 추출
    const method = request.method;
    const url = request.url;
    const queryParams = JSON.stringify(redactSensitiveValue(request.query));
    const body = JSON.stringify(redactSensitiveValue(request.body));
    const timestamp = new Date().toISOString();

    // 상세 알림 메시지 포맷
    const notifyMessage = [
      `🚨 **[poke-lounge-api] Server Error Detected**`,
      ``,
      `**📍 Request Info**`,
      `- **Time**: \`${timestamp}\``,
      `- **Method**: \`${method}\``,
      `- **URL**: \`${url}\``,
      `- **Query**: \`${queryParams}\``,
      `- **Body**: \`\`\`json\n${body}\n\`\`\``,
      ``,
      `**❌ Error Details**`,
      `- **Message**: ${errorMessage}`,
      `- **Stack**:`,
      `\`\`\``,
      stackTrace,
      `\`\`\``,
    ].join('\n');

    const payload = { message: notifyMessage };

    const auth = Buffer.from(`${notifyUser}:${notifyPassword}`).toString(
      'base64',
    );

    const response = await fetch(notifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Notification service responded with ${response.status}`);
    }
  }
}
