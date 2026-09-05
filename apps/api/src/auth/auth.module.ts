import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { LocalTestAuthGuard } from './local-test-auth.guard';

/**
 * 개발용 테스트 계정만 제공한다. 운영 계정 인증은 추후 별도로 도입한다.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [LocalTestAuthGuard],
  // 다른 모듈에서 인증 가드와 유저 리포지토리를 사용할 수 있도록 export함
  exports: [LocalTestAuthGuard, TypeOrmModule],
})
export class AuthModule {}
