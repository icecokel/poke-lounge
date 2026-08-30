import {
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GoogleAuthGuard } from '../src/auth/google-auth.guard';
import type { User } from '../src/auth/entities/user.entity';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { getCorsOptions } from '../src/common/utils/cors.util';
import { PokeLoungeLiveStateService } from '../src/poke-lounge/poke-lounge-live-state.service';
import { PokeLoungeRedisIoAdapter } from '../src/poke-lounge/poke-lounge-redis-io.adapter';

const E2E_TOKEN_PATTERN = /^poke-lounge-e2e-token-([1-5])$/;
const E2E_TABLES = [
  'poke_lounge_competitive_action',
  'poke_lounge_competitive_match',
  'poke_lounge_competitive_seat',
  'poke_lounge_room_command',
  'poke_lounge_room',
  'game_history',
  'game_poke_lounge_state',
] as const;
const E2E_USER_COUNT = 5;

type AuthenticatedRequest = Request & { user?: User };
type E2eHttpAdapter = {
  get(
    path: string,
    handler: (request: Request, response: Response) => void,
  ): void;
};
type E2eMatchAssertion = {
  matchId: string;
  status: string;
  currentTurn: number;
  bracketMatchId: string | null;
  kind: string | null;
  rulesetVersion: number;
  initialPartyByPlayerId: Record<string, E2ePartySummary>;
};
type E2ePartySummary = {
  activeSlotIndex: number;
  members: Array<{
    slotIndex: number;
    speciesId: number;
    level: number;
    moveIds: number[];
  }>;
};
type E2ePartySummarySource = {
  activeSlotIndex?: unknown;
  members?: Array<{
    slotIndex?: unknown;
    speciesId?: unknown;
    level?: unknown;
    moves?: Array<{ moveId?: unknown }>;
  }>;
};
type E2eInitialState = {
  playersById?: Record<
    string,
    {
      activeSlotIndex?: unknown;
      team?: E2ePartySummarySource['members'];
    }
  >;
};
type E2eActionAssertion = {
  matchId: string;
  playerId: string;
  turn: number;
  kind: string;
};

class PokeLoungeE2eAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';
    const match = E2E_TOKEN_PATTERN.exec(token);

    if (!match) {
      throw new UnauthorizedException('Unknown Poke Lounge E2E identity');
    }

    const identityNumber = match[1];
    request.user = {
      id: `e2e-user-${identityNumber}`,
      email: `e2e-user-${identityNumber}@example.test`,
      firstName: 'E2E',
      lastName: `User ${identityNumber}`,
      accessToken: '',
    };
    return true;
  }
}

async function bootstrap(): Promise<void> {
  assertE2eBoundary();

  const testingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideGuard(GoogleAuthGuard)
    .useClass(PokeLoungeE2eAuthGuard)
    .compile();
  const app = testingModule.createNestApplication();
  const liveState = testingModule.get(PokeLoungeLiveStateService);
  await liveState.connect();
  app.useWebSocketAdapter(
    new PokeLoungeRedisIoAdapter(app, liveState.createSocketAdapter()),
  );

  app.enableCors(getCorsOptions(process.env.CORS_ORIGINS));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  if (process.env.POKE_LOUNGE_E2E_RESET_DB === '1') {
    await resetE2eTables(testingModule.get(DataSource));
  }

  const httpAdapterInstance: unknown = app.getHttpAdapter().getInstance();
  registerRedisAssertionEndpoint(
    httpAdapterInstance as E2eHttpAdapter,
    liveState,
  );

  const port = Number.parseInt(process.env.PORT ?? '', 10) || 3001;
  await app.listen(port, '127.0.0.1');

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

function assertE2eBoundary(): void {
  if (process.env.NODE_ENV !== 'test' || process.env.POKE_LOUNGE_E2E !== '1') {
    throw new Error(
      'Poke Lounge E2E API requires NODE_ENV=test and POKE_LOUNGE_E2E=1',
    );
  }

  const databaseName = process.env.DB_DATABASE?.trim();
  if (!databaseName?.endsWith('_test')) {
    throw new Error(
      'Poke Lounge E2E API requires a DB_DATABASE ending in _test',
    );
  }
}

async function resetE2eTables(dataSource: DataSource): Promise<void> {
  const existingTables = await dataSource.query<{ table_name: string }[]>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [E2E_TABLES],
  );
  const existingNames = new Set(existingTables.map((row) => row.table_name));
  const missingTables = E2E_TABLES.filter((table) => !existingNames.has(table));

  if (missingTables.length > 0) {
    throw new Error(
      `Poke Lounge E2E database schema is not migrated: ${missingTables.join(', ')}`,
    );
  }

  const quotedTables = E2E_TABLES.map((table) => `"${table}"`).join(', ');
  await dataSource.query(
    `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`,
  );

  for (
    let identityNumber = 1;
    identityNumber <= E2E_USER_COUNT;
    identityNumber += 1
  ) {
    const id = `e2e-user-${identityNumber}`;
    await dataSource.query(
      `INSERT INTO "user" (id, email, "firstName", "lastName", "accessToken")
       VALUES ($1, $2, 'E2E', $3, NULL)
       ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email,
             "firstName" = EXCLUDED."firstName",
             "lastName" = EXCLUDED."lastName",
             "accessToken" = NULL`,
      [id, `${id}@example.test`, `User ${identityNumber}`],
    );
  }
}

function registerRedisAssertionEndpoint(
  expressApp: E2eHttpAdapter,
  liveState: PokeLoungeLiveStateService,
): void {
  expressApp.get('/__e2e/poke-lounge/assertions', (request, response) => {
    const roomCodeQuery = request.query.roomCode;
    const roomCode = typeof roomCodeQuery === 'string' ? roomCodeQuery : '';
    void Promise.all([
      readRedisAssertions(liveState, roomCode),
      liveState.getCursor(roomCode).then(
        () => true,
        () => false,
      ),
    ]).then(
      ([assertions, worldStatePresent]) =>
        response.status(200).json({ ...assertions, worldStatePresent }),
      (error) =>
        response.status(500).json({
          message: error instanceof Error ? error.message : String(error),
        }),
    );
  });
}

async function readRedisAssertions(
  liveState: PokeLoungeLiveStateService,
  rawRoomCode: string,
) {
  const roomCode = rawRoomCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(roomCode)) {
    throw new Error('A canonical roomCode is required');
  }

  const stored = await liveState.getRoomState(roomCode);
  if (!stored) throw new Error('Poke Lounge E2E room was not found');
  return summarizeRedisAssertionDocument(stored.document, roomCode);
}

function summarizeFrozenParties(
  snapshots: Record<string, unknown>,
): Record<string, E2ePartySummary> {
  return Object.fromEntries(
    Object.entries(snapshots ?? {}).map(([playerId, snapshot]) => [
      playerId,
      summarizeParty(expectRecord(snapshot, 'party snapshot').competitiveParty),
    ]),
  );
}

function summarizeInitialParties(
  state: E2eInitialState,
): Record<string, E2ePartySummary> {
  return Object.fromEntries(
    Object.entries(state.playersById ?? {}).map(([playerId, player]) => [
      playerId,
      summarizeParty({
        activeSlotIndex: player.activeSlotIndex,
        members: player.team,
      }),
    ]),
  );
}

function summarizeParty(rawParty: unknown): E2ePartySummary {
  const party = expectRecord(
    rawParty,
    'competitive party',
  ) as E2ePartySummarySource;
  return {
    activeSlotIndex: Number(party?.activeSlotIndex),
    members: (party?.members ?? []).map((member) => ({
      slotIndex: Number(member.slotIndex),
      speciesId: Number(member.speciesId),
      level: Number(member.level),
      moveIds: (member.moves ?? []).map((move) => Number(move.moveId)),
    })),
  };
}

export function summarizeRedisAssertionDocument(
  rawDocument: string,
  expectedRoomCode: string,
) {
  const document = expectRecord(
    JSON.parse(rawDocument) as unknown,
    'Redis document',
  );
  const room = expectRecord(document.room, 'Redis room');
  const roomCode = expectString(room.roomCode, 'roomCode');
  if (document.version !== 1 || roomCode !== expectedRoomCode) {
    throw new Error('Poke Lounge Redis room document is malformed');
  }

  const seats = expectArray(document.seats, 'Redis seats').map((seat) =>
    expectRecord(seat, 'Redis seat'),
  );
  const matches = Object.values(
    expectRecord(document.matches, 'Redis matches'),
  ).map((rawMatch) => {
    const match = expectRecord(rawMatch, 'Redis match');
    const initialState = expectRecord(
      match.initialState,
      'Redis match initial state',
    ) as E2eInitialState;
    const summarized: E2eMatchAssertion = {
      matchId: expectString(match.matchId, 'matchId'),
      status: expectString(match.status, 'match status'),
      currentTurn: expectInteger(match.currentTurn, 'match currentTurn'),
      bracketMatchId:
        match.bracketMatchId === null
          ? null
          : expectString(match.bracketMatchId, 'bracketMatchId'),
      kind: match.kind === null ? null : expectString(match.kind, 'match kind'),
      rulesetVersion: expectInteger(match.rulesetVersion, 'rulesetVersion'),
      initialPartyByPlayerId: summarizeInitialParties(initialState),
    };
    return summarized;
  });
  const actions = Object.values(
    expectRecord(document.actions, 'Redis actions'),
  ).map((rawAction): E2eActionAssertion => {
    const action = expectRecord(rawAction, 'Redis action');
    const command = expectRecord(action.action, 'Redis action command');
    return {
      matchId: expectString(action.matchId, 'action matchId'),
      playerId: expectString(action.actorPlayerId, 'action actorPlayerId'),
      turn: expectInteger(action.turn, 'action turn'),
      kind: expectString(command.kind, 'action kind'),
    };
  });

  return {
    roomCode,
    revision: expectInteger(room.revision, 'room revision'),
    tournament: room.tournament ?? null,
    frozenPartyByPlayerId: summarizeFrozenParties(
      expectRecord(room.partySnapshots, 'party snapshots'),
    ),
    seatCount: seats.length,
    distinctAccountCount: new Set(
      seats.map((seat) => expectString(seat.accountId, 'seat accountId')),
    ).size,
    matches,
    actionCount: actions.length,
    ...summarizeActionEvidence(actions),
  };
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is malformed`);
  return value;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} is malformed`);
  return value;
}

function expectInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label} is malformed`);
  }
  return value;
}

export function summarizeActionEvidence(actions: E2eActionAssertion[]) {
  const actionKindCounts = { move: 0, switch: 0 };
  const forcedSwitchTurns: Array<{
    matchId: string;
    playerId: string;
    turn: number;
  }> = [];

  for (const action of actions) {
    if (action.kind !== 'move' && action.kind !== 'switch') {
      throw new Error(`Unknown competitive action kind: ${action.kind}`);
    }

    actionKindCounts[action.kind] += 1;
    if (action.kind === 'switch') {
      forcedSwitchTurns.push({
        matchId: action.matchId,
        playerId: action.playerId,
        turn: action.turn,
      });
    }
  }

  return { actionKindCounts, forcedSwitchTurns };
}

if (require.main === module) {
  void bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
