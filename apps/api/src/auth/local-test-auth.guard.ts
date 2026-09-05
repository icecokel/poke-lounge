import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import type { Request } from 'express';
import { User } from './entities/user.entity';
import { ErrorMessage } from '../common/constants/message.constant';
import {
  LOCAL_TEST_ACCOUNT_PROFILE,
  isLocalTestAccountRequestAllowed,
  resolveLocalTestAuthToken,
} from './local-test-account';

type LocalTestRequest = Request & { user?: User };

/** Account APIs are disabled outside the explicitly enabled development test mode. */
@Injectable()
export class LocalTestAuthGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const localTestToken = resolveLocalTestAuthToken();
    if (!localTestToken) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'ACCOUNT_AUTH_DISABLED',
        message: 'Account authentication is disabled. Use anonymous play.',
      });
    }

    const request = context.switchToHttp().getRequest<LocalTestRequest>();
    const authorization = request.headers.authorization;
    if (!authorization) {
      throw new UnauthorizedException(ErrorMessage.AUTH.NO_TOKEN);
    }
    if (
      authorization !== `Bearer ${localTestToken}` ||
      !isLocalTestAccountRequestAllowed(request)
    ) {
      throw new UnauthorizedException(ErrorMessage.AUTH.INVALID_TOKEN);
    }

    // Never derive identity from client body, headers or a supplied account ID.
    request.user = await this.findOrCreateLocalTestUser();
    return true;
  }

  private async findOrCreateLocalTestUser(): Promise<User> {
    const where = { id: LOCAL_TEST_ACCOUNT_PROFILE.id };
    const existing = await this.userRepository.findOne({ where });
    if (existing) return existing;

    const user = this.userRepository.create(LOCAL_TEST_ACCOUNT_PROFILE);
    try {
      return await this.userRepository.save(user);
    } catch (error) {
      if (
        !(error instanceof QueryFailedError) ||
        (error.driverError as { code?: string }).code !== '23505'
      ) {
        throw error;
      }
      const concurrentUser = await this.userRepository.findOne({ where });
      if (!concurrentUser) throw error;
      return concurrentUser;
    }
  }
}
