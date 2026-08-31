import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { GoogleAuthGuard } from '../auth/google-auth.guard';
import { CompetitiveMatchService } from './competitive/competitive-match.service';
import { BindCompetitiveSeatDto } from './dto/bind-competitive-seat.dto';
import { CompetitiveAssignmentResponseDto } from './dto/competitive-assignment-response.dto';
import { CompetitiveActionResponseDto } from './dto/competitive-action-response.dto';
import {
  SubmitCompetitiveActionDto,
  SubmitSessionCompetitiveActionDto,
  toCanonicalCompetitiveAction,
} from './dto/submit-competitive-action.dto';
import { CreatePokeLoungeRoomDto } from './dto/create-poke-lounge-room.dto';
import { JoinPokeLoungeRoomDto } from './dto/join-poke-lounge-room.dto';
import { LeavePokeLoungeRoomDto } from './dto/leave-poke-lounge-room.dto';
import { PokeLoungeRoomResponseDto } from './dto/poke-lounge-room-response.dto';
import { PokeLoungeRomDataResponseDto } from './dto/poke-lounge-rom-data-response.dto';
import { SetPokeLoungeReadyDto } from './dto/set-poke-lounge-ready.dto';
import { SetPokeLoungeRoundReadyDto } from './dto/set-poke-lounge-round-ready.dto';
import { StartPokeLoungeRoomDto } from './dto/start-poke-lounge-room.dto';
import { SubmitPokeLoungeMatchResultDto } from './dto/submit-poke-lounge-match-result.dto';
import { UpdatePokeLoungePartySnapshotDto } from './dto/update-poke-lounge-party-snapshot.dto';
import type {
  PokeLoungeIdempotentCommandContext,
  PokeLoungeRoomCommandContext,
} from './poke-lounge-room-command';
import {
  PokeLoungeRoomConflictResponseDto,
  PokeLoungeRoomFullResponseDto,
  toPokeLoungePublicRoomState,
} from './poke-lounge-room-conflict';
import { PokeLoungeRoomService } from './poke-lounge-room.service';
import { PokeLoungeRomDataService } from './poke-lounge-rom-data.service';

const IDEMPOTENCY_HEADER = 'X-Idempotency-Key';
const REVISION_HEADER = 'If-Match-Revision';
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REVISION_PATTERN = /^(0|[1-9][0-9]*)$/;
const UUID_V4_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

@ApiTags('poke-lounge')
@ApiExtraModels(
  PokeLoungeRoomConflictResponseDto,
  PokeLoungeRoomFullResponseDto,
)
@Controller('poke-lounge')
export class PokeLoungeController {
  constructor(
    private readonly roomService: PokeLoungeRoomService,
    private readonly competitiveMatchService: CompetitiveMatchService,
    private readonly romDataService: PokeLoungeRomDataService,
  ) {}

  @Get('rom-data')
  @ApiOperation({ summary: 'ROM에서 추출한 Poke Lounge 게임 데이터 조회' })
  @ApiOkResponse({ type: PokeLoungeRomDataResponseDto })
  @ApiServiceUnavailableResponse({
    description: '필수 ROM 문서가 없거나 무결하지 않음',
  })
  getRomData(): Promise<PokeLoungeRomDataResponseDto> {
    return this.romDataService.getRuntimeData();
  }

  @Post('rooms')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiHeader({ name: REVISION_HEADER, required: true, example: '0' })
  @ApiBody({ type: CreatePokeLoungeRoomDto })
  @ApiCreatedResponse({ type: PokeLoungeRoomResponseDto })
  @ApiConflictResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(PokeLoungeRoomConflictResponseDto) },
        { $ref: getSchemaPath(PokeLoungeRoomFullResponseDto) },
      ],
    },
  })
  async createRoom(
    @Body() body: CreatePokeLoungeRoomDto,
    @Req() request: Request,
  ) {
    const command = parseRoomCommandHeaders(request);

    if (command.expectedRevision !== 0) {
      throw new BadRequestException(
        'If-Match-Revision must be 0 when creating a room',
      );
    }

    return toPokeLoungePublicRoomState(
      await this.roomService.createRoom(withoutClientNowMs(body), command, {
        requireSocketAcknowledgement: true,
      }),
    );
  }

  @Get('rooms/:roomCode')
  @ApiOkResponse({ type: PokeLoungeRoomResponseDto })
  @ApiQuery({
    name: 'afterRevision',
    required: false,
    type: Number,
    minimum: 0,
  })
  async getRoom(
    @Param('roomCode') roomCode: string,
    @Query('afterRevision') afterRevision?: string,
  ) {
    const parsedAfterRevision = parseOptionalRevision(afterRevision);

    return toPokeLoungePublicRoomState(
      await this.roomService.getRoom(roomCode, parsedAfterRevision),
    );
  }

  @Post('rooms/:roomCode/competitive-seat')
  @UseGuards(GoogleAuthGuard)
  @ApiBearerAuth()
  @ApiBody({ type: BindCompetitiveSeatDto })
  @ApiCreatedResponse({ type: CompetitiveAssignmentResponseDto })
  async bindCompetitiveSeat(
    @Param('roomCode') roomCode: string,
    @Body() body: BindCompetitiveSeatDto,
    @Req() request: AuthenticatedPokeLoungeRequest,
  ) {
    if (!request.user?.id) {
      throw new BadRequestException('Authenticated account is required');
    }

    return this.competitiveMatchService.bindSeat(
      roomCode,
      body.sessionId,
      request.user.id,
    );
  }

  @Post('rooms/:roomCode/matches/:matchId/actions')
  @UseGuards(GoogleAuthGuard)
  @ApiBearerAuth()
  @ApiBody({ type: SubmitCompetitiveActionDto })
  @ApiCreatedResponse({ type: CompetitiveActionResponseDto })
  async submitCompetitiveAction(
    @Param('roomCode') roomCode: string,
    @Param('matchId') matchId: string,
    @Body() body: SubmitCompetitiveActionDto,
    @Req() request: AuthenticatedPokeLoungeRequest,
  ) {
    if (!request.user?.id) {
      throw new BadRequestException('Authenticated account is required');
    }

    if (!UUID_V4_PATH_PATTERN.test(matchId)) {
      throw new BadRequestException('matchId must be a canonical UUID v4');
    }

    return this.competitiveMatchService.submitAction({
      roomCode: roomCode.trim().toUpperCase(),
      matchId: matchId.toLowerCase(),
      accountId: request.user.id,
      assignmentRevision: body.assignmentRevision,
      turn: body.turn,
      clientCommandId: body.clientCommandId,
      action: toCanonicalCompetitiveAction(body.action),
    });
  }

  @Post('rooms/:roomCode/matches/:matchId/session-actions')
  @ApiBody({ type: SubmitSessionCompetitiveActionDto })
  @ApiCreatedResponse({ type: CompetitiveActionResponseDto })
  async submitSessionCompetitiveAction(
    @Param('roomCode') roomCode: string,
    @Param('matchId') matchId: string,
    @Body() body: SubmitSessionCompetitiveActionDto,
  ) {
    if (!UUID_V4_PATH_PATTERN.test(matchId)) {
      throw new BadRequestException('matchId must be a canonical UUID v4');
    }

    return this.competitiveMatchService.submitSessionAction({
      roomCode: roomCode.trim().toUpperCase(),
      matchId: matchId.toLowerCase(),
      sessionId: body.sessionId,
      assignmentRevision: body.assignmentRevision,
      turn: body.turn,
      clientCommandId: body.clientCommandId,
      action: toCanonicalCompetitiveAction(body.action),
    });
  }

  @Post('rooms/:roomCode/join')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiHeader({ name: REVISION_HEADER, required: true, example: '0' })
  @ApiBody({ type: JoinPokeLoungeRoomDto })
  @ApiCreatedResponse({ type: PokeLoungeRoomResponseDto })
  @ApiConflictResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(PokeLoungeRoomConflictResponseDto) },
        { $ref: getSchemaPath(PokeLoungeRoomFullResponseDto) },
      ],
    },
  })
  async joinRoom(
    @Param('roomCode') roomCode: string,
    @Body() body: JoinPokeLoungeRoomDto,
    @Req() request: Request,
  ) {
    const command = parseRoomCommandHeaders(request);

    return toPokeLoungePublicRoomState(
      await this.roomService.joinRoom(
        roomCode,
        withoutClientNowMs(body),
        command,
        { requireSocketAcknowledgement: true },
      ),
    );
  }

  @Post('rooms/:roomCode/ready')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiHeader({ name: REVISION_HEADER, required: true, example: '0' })
  @ApiBody({ type: SetPokeLoungeReadyDto })
  @ApiCreatedResponse({ type: PokeLoungeRoomResponseDto })
  @ApiConflictResponse({ type: PokeLoungeRoomConflictResponseDto })
  async setReady(
    @Param('roomCode') roomCode: string,
    @Body() body: SetPokeLoungeReadyDto,
    @Req() request: Request,
  ) {
    const command = parseRoomCommandHeaders(request);

    return toPokeLoungePublicRoomState(
      await this.roomService.setReady(
        roomCode,
        {
          playerId: body.playerId,
          sessionId: body.sessionId,
          ready: body.ready,
        },
        command,
      ),
    );
  }

  @Post('rooms/:roomCode/round-ready')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiBody({ type: SetPokeLoungeRoundReadyDto })
  @ApiCreatedResponse({ type: PokeLoungeRoomResponseDto })
  async setRoundReady(
    @Param('roomCode') roomCode: string,
    @Body() body: SetPokeLoungeRoundReadyDto,
    @Req() request: Request,
  ) {
    return toPokeLoungePublicRoomState(
      await this.roomService.setRoundReady(
        roomCode,
        {
          playerId: body.playerId,
          sessionId: body.sessionId,
          roundIndex: body.roundIndex,
        },
        parseIdempotencyHeader(request),
      ),
    );
  }

  @Post('rooms/:roomCode/start')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiHeader({ name: REVISION_HEADER, required: true, example: '0' })
  @ApiBody({ type: StartPokeLoungeRoomDto })
  @ApiCreatedResponse({ type: PokeLoungeRoomResponseDto })
  @ApiConflictResponse({ type: PokeLoungeRoomConflictResponseDto })
  async startRoom(
    @Param('roomCode') roomCode: string,
    @Body() body: StartPokeLoungeRoomDto,
    @Req() request: Request,
  ) {
    const command = parseRoomCommandHeaders(request);

    return toPokeLoungePublicRoomState(
      await this.roomService.startRoom(
        roomCode,
        {
          playerId: body.playerId,
          sessionId: body.sessionId,
        },
        command,
      ),
    );
  }

  @Post('rooms/:roomCode/party-snapshot')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiHeader({ name: REVISION_HEADER, required: true, example: '0' })
  @ApiBody({ type: UpdatePokeLoungePartySnapshotDto })
  @ApiCreatedResponse({ type: PokeLoungeRoomResponseDto })
  @ApiConflictResponse({ type: PokeLoungeRoomConflictResponseDto })
  async updatePartySnapshot(
    @Param('roomCode') roomCode: string,
    @Body() body: UpdatePokeLoungePartySnapshotDto,
    @Req() request: Request,
  ) {
    const command = parseRoomCommandHeaders(request);

    return toPokeLoungePublicRoomState(
      await this.roomService.updatePartySnapshot(
        roomCode,
        withoutClientNowMs(body),
        command,
      ),
    );
  }

  @Post('rooms/:roomCode/result')
  @ApiOperation({
    summary: 'Submit a casual Poke Lounge result',
    description:
      'Client-reported room results remain unverified and cannot create verified trust or public ranking entries.',
  })
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiHeader({ name: REVISION_HEADER, required: true, example: '0' })
  @ApiBody({ type: SubmitPokeLoungeMatchResultDto })
  @ApiCreatedResponse({ type: PokeLoungeRoomResponseDto })
  @ApiConflictResponse({ type: PokeLoungeRoomConflictResponseDto })
  async submitResult(
    @Param('roomCode') roomCode: string,
    @Body() body: SubmitPokeLoungeMatchResultDto,
    @Req() request: Request,
  ) {
    const command = parseRoomCommandHeaders(request);

    return toPokeLoungePublicRoomState(
      await this.roomService.submitMatchResult(
        roomCode,
        withoutClientNowMs(body),
        command,
      ),
    );
  }

  @Post('rooms/:roomCode/leave')
  @ApiHeader({ name: IDEMPOTENCY_HEADER, required: true })
  @ApiHeader({ name: REVISION_HEADER, required: true, example: '0' })
  @ApiBody({ type: LeavePokeLoungeRoomDto })
  @ApiCreatedResponse({ type: PokeLoungeRoomResponseDto })
  @ApiConflictResponse({ type: PokeLoungeRoomConflictResponseDto })
  async leaveRoom(
    @Param('roomCode') roomCode: string,
    @Body() body: LeavePokeLoungeRoomDto,
    @Req() request: Request,
  ) {
    const command = parseRoomCommandHeaders(request);

    return toPokeLoungePublicRoomState(
      await this.roomService.leaveRoom(
        roomCode,
        {
          playerId: body.playerId,
          sessionId: body.sessionId,
        },
        command,
      ),
    );
  }
}

type AuthenticatedPokeLoungeRequest = Request & {
  user?: { id: string };
};

function parseOptionalRevision(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!REVISION_PATTERN.test(value)) {
    throw new BadRequestException(
      'afterRevision must be a non-negative safe integer',
    );
  }

  const revision = Number(value);

  if (!Number.isSafeInteger(revision)) {
    throw new BadRequestException(
      'afterRevision must be a non-negative safe integer',
    );
  }

  return revision;
}

function parseRoomCommandHeaders(
  request: Request,
): PokeLoungeRoomCommandContext {
  const idempotencyKey = readSingleRawHeader(request, IDEMPOTENCY_HEADER);
  const revisionValue = readSingleRawHeader(request, REVISION_HEADER);

  if (!UUID_V4_PATTERN.test(idempotencyKey)) {
    throw new BadRequestException(
      `${IDEMPOTENCY_HEADER} must be a canonical UUID v4`,
    );
  }

  if (!REVISION_PATTERN.test(revisionValue)) {
    throw new BadRequestException(
      `${REVISION_HEADER} must be a non-negative safe integer`,
    );
  }

  const expectedRevision = Number(revisionValue);

  if (!Number.isSafeInteger(expectedRevision)) {
    throw new BadRequestException(
      `${REVISION_HEADER} must be a non-negative safe integer`,
    );
  }

  return { idempotencyKey, expectedRevision };
}

function parseIdempotencyHeader(
  request: Request,
): PokeLoungeIdempotentCommandContext {
  const idempotencyKey = readSingleRawHeader(request, IDEMPOTENCY_HEADER);

  if (!UUID_V4_PATTERN.test(idempotencyKey)) {
    throw new BadRequestException(
      `${IDEMPOTENCY_HEADER} must be a canonical UUID v4`,
    );
  }

  return { idempotencyKey };
}

function readSingleRawHeader(request: Request, headerName: string): string {
  const values: string[] = [];

  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === headerName.toLowerCase()) {
      values.push(request.rawHeaders[index + 1] ?? '');
    }
  }

  if (values.length !== 1) {
    throw new BadRequestException(
      `${headerName} header must be provided exactly once`,
    );
  }

  return values[0];
}

function withoutClientNowMs<T extends object>(input: T): Omit<T, 'nowMs'> {
  const serverTimedInput = { ...input } as T & { nowMs?: unknown };
  delete serverTimedInput.nowMs;
  return serverTimedInput;
}
