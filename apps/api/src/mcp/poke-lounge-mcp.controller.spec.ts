import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge/poke-lounge-room.repository';
import { PokeLoungeRoomService } from '../poke-lounge/poke-lounge-room.service';
import { createPokeLoungeMcpServer } from './poke-lounge-mcp.controller';

describe('poke-lounge-remote-mcp', function testSuite() {
  it('lists read-only tools and returns a public room summary', async function testCase() {
    const getRoom = jest.fn().mockResolvedValue(roomSnapshot());
    const server = createPokeLoungeMcpServer({
      getRoom,
    } as unknown as PokeLoungeRoomService);
    const client = new Client({ name: 'poke-lounge-test', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(
      tools.tools.map(function getName(tool) {
        return tool.name;
      }),
    ).toEqual(['get_game_info', 'get_room']);
    expect(
      tools.tools.every(function toolIsReadOnly(tool) {
        return tool.annotations?.readOnlyHint === true;
      }),
    ).toBe(true);

    const result = await client.callTool({
      name: 'get_room',
      arguments: { roomCode: 'room01' },
    });
    expect(getRoom).toHaveBeenCalledWith('ROOM01');
    expect(result.structuredContent).toMatchObject({
      roomCode: 'ROOM01',
      hostPlayerId: 'player-a',
      participants: [
        {
          playerId: 'player-a',
          displayName: 'Player A',
          controller: 'human',
        },
      ],
      playUrl: 'https://poke-lounge.icecoke.kr/?room=ROOM01',
    });

    getRoom.mockClear();
    const invalidResult = await client.callTool({
      name: 'get_room',
      arguments: { roomCode: 'bad' },
    });
    expect(invalidResult.isError).toBe(true);
    expect(getRoom).not.toHaveBeenCalled();

    await client.close();
    await server.close();
  });
});

function roomSnapshot(): PokeLoungeRoomSnapshot {
  return {
    roomCode: 'ROOM01',
    visibility: 'public',
    status: 'waiting',
    createdAtMs: 1,
    updatedAtMs: 2,
    participants: [
      {
        sessionId: 'private-session',
        userId: 'private-user',
        playerId: 'player-a',
        displayName: 'Player A',
        role: 'participant',
        ready: false,
        connected: true,
        joinedAtMs: 1,
      },
    ],
    partySnapshots: {},
    round: {
      index: 1,
      phase: 'waiting',
      durationMs: 60_000,
      startedAtMs: null,
      endsAtMs: null,
    },
    tournament: {
      version: 2,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: {},
    },
    finalStandings: [],
    revision: 3,
    expiresAtMs: 1_800_000,
  };
}
