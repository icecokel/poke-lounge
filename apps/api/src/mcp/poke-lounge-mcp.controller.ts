import {
  Controller,
  Delete,
  Get,
  HttpException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import * as z from 'zod/v4';
import { toPokeLoungePublicRoomState } from '../poke-lounge/poke-lounge-room-conflict';
import { PokeLoungeRoomService } from '../poke-lounge/poke-lounge-room.service';

const PLAY_URL = 'https://poke-lounge.icecoke.kr';
const REPOSITORY_URL = 'https://github.com/icecokel/poke-lounge';
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function createPokeLoungeMcpServer(
  roomService: PokeLoungeRoomService,
): McpServer {
  const server = new McpServer(
    { name: 'poke-lounge-remote-mcp', version: '1.0.0' },
    {
      instructions:
        'Read public Poke Lounge service information and room summaries. This server never creates, joins, or changes a room.',
    },
  );

  server.registerTool(
    'get_game_info',
    {
      title: 'Get Poke Lounge game information',
      description:
        'Get the public Poke Lounge play URL, source repository, and supported player count.',
      inputSchema: {},
      outputSchema: {
        name: z.string(),
        description: z.string(),
        playUrl: z.url(),
        repositoryUrl: z.url(),
        supportedPlayers: z.string(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    function getGameInfo() {
      const structuredContent = {
        name: 'Poke Lounge',
        description:
          'A browser-based multiplayer Pokemon battle lounge with three-round tournaments.',
        playUrl: PLAY_URL,
        repositoryUrl: REPOSITORY_URL,
        supportedPlayers: '2-8',
      };

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(structuredContent) },
        ],
        structuredContent,
      };
    },
  );

  server.registerTool(
    'get_room',
    {
      title: 'Get a Poke Lounge room',
      description:
        'Get a public, read-only summary of a Poke Lounge room by its six-character room code.',
      inputSchema: {
        roomCode: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9]{6}$/)
          .describe('Six-character Poke Lounge room code'),
      },
      outputSchema: {
        roomCode: z.string(),
        visibility: z.enum(['public', 'private']),
        status: z.enum([
          'waiting',
          'round-started',
          'tournament',
          'completed',
          'closed',
        ]),
        revision: z.number().int().nonnegative(),
        hostPlayerId: z.string().nullable(),
        participants: z.array(
          z.object({
            playerId: z.string(),
            displayName: z.string(),
            controller: z.enum(['human', 'ai']),
            role: z.enum(['participant', 'spectator']),
            ready: z.boolean(),
            connected: z.boolean(),
          }),
        ),
        round: z.object({
          index: z.number().int().nonnegative(),
          phase: z.enum([
            'waiting',
            'round-started',
            'tournament',
            'completed',
          ]),
          startedAtMs: z.number().nullable(),
          endsAtMs: z.number().nullable(),
        }),
        finalStandings: z.array(
          z.object({
            playerId: z.string(),
            displayName: z.string(),
            rank: z.number().int().positive(),
            score: z.number(),
          }),
        ),
        playUrl: z.url(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async function getRoom({ roomCode }) {
      try {
        const room = toPokeLoungePublicRoomState(
          await roomService.getRoom(roomCode.toUpperCase()),
        );
        const structuredContent = {
          roomCode: room.roomCode,
          visibility: room.visibility,
          status: room.status,
          revision: room.revision,
          hostPlayerId: room.hostPlayerId,
          participants: room.participants.map(
            function mapParticipant(participant) {
              return {
                playerId: participant.playerId,
                displayName: participant.displayName,
                controller: participant.controller,
                role: participant.role,
                ready: participant.ready,
                connected: participant.connected,
              };
            },
          ),
          round: {
            index: room.round.index,
            phase: room.round.phase,
            startedAtMs: room.round.startedAtMs,
            endsAtMs: room.round.endsAtMs,
          },
          finalStandings: room.finalStandings,
          playUrl: `${PLAY_URL}/?room=${room.roomCode}`,
        };

        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(structuredContent) },
          ],
          structuredContent,
        };
      } catch (error) {
        const message =
          error instanceof HttpException && error.getStatus() < 500
            ? error.message
            : 'Unable to read the Poke Lounge room';

        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
        };
      }
    },
  );

  return server;
}

@Controller('mcp')
export class PokeLoungeMcpController {
  constructor(private readonly roomService: PokeLoungeRoomService) {}

  @Post()
  async post(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const server = createPokeLoungeMcpServer(this.roomService);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    response.on('close', function closeMcpRequest() {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch {
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  }

  @Get()
  get(@Res() response: Response): void {
    this.methodNotAllowed(response);
  }

  @Delete()
  delete(@Res() response: Response): void {
    this.methodNotAllowed(response);
  }

  private methodNotAllowed(response: Response): void {
    response.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null,
    });
  }
}
