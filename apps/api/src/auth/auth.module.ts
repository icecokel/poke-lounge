import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { GoogleAuthGuard } from './google-auth.guard';

/**
 * 인증 기능을 담당하는 모듈
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [GoogleAuthGuard],
  // 다른 모듈에서 인증 가드와 유저 리포지토리를 사용할 수 있도록 export함
  exports: [GoogleAuthGuard, TypeOrmModule],
})
export class AuthModule {}
