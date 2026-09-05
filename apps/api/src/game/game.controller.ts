import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  Req,
  Query,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiServiceUnavailableResponse,
  ApiCreatedResponse,
  ApiTags,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { GameService } from './game.service';
import { CreateGameHistoryDto } from './dto/create-game-history.dto';
import { GameHistoryResponseDto } from './dto/game-history-response.dto';
import { GameRankingHistoryDto } from './dto/game-ranking-history.dto';
import { PokeLoungeStateResponseDto } from './dto/poke-lounge-state-response.dto';
import { SavePokeLoungeStateDto } from './dto/save-poke-lounge-state.dto';
import { LocalTestAuthGuard } from '../auth/local-test-auth.guard';
import { GameType } from './enums/game-type.enum';
import { User } from '../auth/entities/user.entity';
import type { TransientPokeLoungeState } from './game.service';

type AuthenticatedRequest = Request & { user: User };

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 게임 결과 관리 및 랭킹 조회를 담당하는 컨트롤러
 */
@ApiTags('Game')
@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  /**
   * 게임 결과 저장 및 현재 등수 반환
   */
  @Post('result')
  @UseGuards(LocalTestAuthGuard)
  @ApiServiceUnavailableResponse({
    description:
      'Account authentication is disabled; anonymous play remains available.',
  })
  @ApiBearerAuth()
  @ApiOperation({ summary: '게임 결과 생성 및 랭킹 확인' })
  @ApiCreatedResponse({ type: GameHistoryResponseDto })
  async createResult(
    @Req() req: AuthenticatedRequest,
    @Body() createGameHistoryDto: CreateGameHistoryDto,
  ): Promise<GameHistoryResponseDto> {
    const history = await this.gameService.createHistory(
      req.user,
      createGameHistoryDto,
    );

    // 내 역대 최고 점수
    const bestScore = await this.gameService.getUserBestScore(
      req.user.id,
      history.gameType,
    );

    if (!this.gameService.isPublicRankingEligible(history.gameType)) {
      return {
        id: history.id,
        score: history.score,
        gameType: history.gameType,
        createdAt: history.createdAt,
        user: {
          displayName: `${history.user.firstName} ${history.user.lastName}`,
        },
        rank: null,
        bestScore,
        allTimeRank: null,
        weeklyRank: null,
      };
    }

    // 전체 랭킹 (내 최고 점수 기준)
    const allTimeRank = await this.gameService.getUserRank(
      req.user.id,
      bestScore,
      history.gameType,
    );

    // 주간 랭킹 (KST 기준)
    const { start, end } = this.getWeeklyDateRangeKST();
    const weeklyBestScore = await this.gameService.getUserBestScore(
      req.user.id,
      history.gameType,
      { start, end },
    );
    const weeklyRank = await this.gameService.getUserRank(
      req.user.id,
      weeklyBestScore,
      history.gameType,
      { start, end },
    );

    // 현재 게임의 등수 계산 (기존 로직 유지)
    // const currentRank = await this.gameService.getUserRank(
    //   req.user.id,
    //   history.score,
    //   history.gameType,
    // );
    // -> 요구사항: API 응답에 `rank` 필드가 있는데, 이는 "이번 판의 등수"인지 "내 최고 기록의 등수"인지 명확하지 않음.
    // 기존 코드에서는 'rank' 변수에 getUserRank(history.score) 결과를 담아서 반환했음.
    // DTO 상 'rank'는 "현재 등수"라고 되어 있음. 이번 판 점수의 등수를 의미하는 듯.
    // 하지만 기획상 "전체 랭킹", "주간 랭킹"이 추가되므로 'rank'의 의미가 중복될 수 있음.
    // 여기서는 'rank' 필드를 "이번 판 점수의 등수"로 유지하고, 추가 필드를 채워줌.

    const currentRank = await this.gameService.getUserRank(
      req.user.id,
      history.score,
      history.gameType,
    );

    return {
      id: history.id,
      score: history.score,
      gameType: history.gameType,
      createdAt: history.createdAt,
      user: {
        displayName: `${history.user.firstName} ${history.user.lastName}`,
      },
      rank: currentRank,
      bestScore,
      allTimeRank,
      weeklyRank,
    };
  }

  @Put('poke-lounge/state')
  @UseGuards(LocalTestAuthGuard)
  @ApiServiceUnavailableResponse({
    description:
      'Account authentication is disabled; anonymous play remains available.',
  })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Poke Lounge 상태 저장' })
  @ApiOkResponse({ type: PokeLoungeStateResponseDto })
  async savePokeLoungeState(
    @Req() req: AuthenticatedRequest,
    @Body() body: SavePokeLoungeStateDto,
  ): Promise<PokeLoungeStateResponseDto> {
    const savedState = await this.gameService.savePokeLoungeState(
      req.user,
      body,
    );

    return toPokeLoungeStateResponse(savedState);
  }

  @Get('poke-lounge/state')
  @UseGuards(LocalTestAuthGuard)
  @ApiServiceUnavailableResponse({
    description:
      'Account authentication is disabled; anonymous play remains available.',
  })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Poke Lounge 상태 조회' })
  @ApiOkResponse({ type: PokeLoungeStateResponseDto })
  @ApiNotFoundResponse({ description: '저장된 Poke Lounge 상태가 없음' })
  async getPokeLoungeState(
    @Req() req: AuthenticatedRequest,
  ): Promise<PokeLoungeStateResponseDto> {
    const savedState = await this.gameService.findPokeLoungeState(req.user.id);

    return toPokeLoungeStateResponse(savedState);
  }

  /**
   * KST(UTC+9) 기준 이번 주 월요일 00:00:00 ~ 일요일 23:59:59의 Date 범위를 반환
   */
  private getWeeklyDateRangeKST(): { start: Date; end: Date } {
    const kstNow = new Date(Date.now() + KST_OFFSET_MS);
    const diffToMonday = (kstNow.getUTCDay() + 6) % 7;
    const start = new Date(
      Date.UTC(
        kstNow.getUTCFullYear(),
        kstNow.getUTCMonth(),
        kstNow.getUTCDate() - diffToMonday,
      ) - KST_OFFSET_MS,
    );
    const end = new Date(start.getTime() + WEEK_MS - 1);

    return { start, end };
  }

  /**
   * 게임별 랭킹 목록 조회 (Top 10)
   */
  @Get('ranking')
  @ApiOperation({
    summary: '게임별 Top 10 랭킹 조회',
    description: 'POKE_LOUNGE는 영속 기록을 만들지 않아 빈 배열을 반환합니다.',
  })
  @ApiQuery({
    name: 'gameType',
    required: true,
    enum: GameType,
    enumName: 'GameType',
    description: '조회할 게임 타입',
  })
  @ApiOkResponse({ type: GameRankingHistoryDto, isArray: true })
  async getRanking(
    @Query('gameType', new ParseEnumPipe(GameType)) gameType: GameType,
  ): Promise<GameRankingHistoryDto[]> {
    const rankings = await this.gameService.getRanking(gameType);

    return rankings.map(function mapItem(ranking) {
      return {
        score: ranking.score,
        rank: ranking.rank,
        createdAt: ranking.createdAt,
        user: {
          displayName: ranking.user.displayName,
        },
      };
    });
  }

  /**
   * 특정 게임 결과 상세 조회 (ID 기준, 공유용)
   */
  @Get('result/:id')
  @ApiOperation({ summary: '게임 결과 상세 조회' })
  @ApiOkResponse({
    type: GameHistoryResponseDto,
    description: '공유된 게임 결과 조회 (로그인 필요 없음)',
  })
  async getGameResult(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GameHistoryResponseDto> {
    const history = await this.gameService.findHistoryById(id);

    return {
      id: history.id,
      score: history.score,
      gameType: history.gameType,
      createdAt: history.createdAt,
      user: {
        displayName: `${history.user.firstName} ${history.user.lastName}`,
      },
    };
  }
}

function toPokeLoungeStateResponse(
  savedState: TransientPokeLoungeState,
): PokeLoungeStateResponseDto {
  return {
    id: savedState.id,
    userId: savedState.userId,
    state: savedState.state,
    revision: savedState.revision,
    createdAt: savedState.createdAt,
    updatedAt: savedState.updatedAt,
    clientUpdatedAt: savedState.clientUpdatedAt,
  };
}
