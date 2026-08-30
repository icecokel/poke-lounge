import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 성공 응답 형식을 정의하는 인터페이스
 */
export interface Response<T> {
  success: true;
  data: T;
}

/**
 * 성공 응답을 일관된 JSON 형식({ success: true, data: ... })으로 변환하는 인터셉터
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  Response<T>
> {
  /**
   * 요청을 가로채어 응답 데이터를 data 필드에 감쌈
   */
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<Response<T>> {
    return next.handle().pipe(
      map((data: T) => ({
        success: true,
        data,
      })),
    );
  }
}
