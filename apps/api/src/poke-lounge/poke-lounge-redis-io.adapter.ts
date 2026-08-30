import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';

export class PokeLoungeRedisIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly redisAdapter: ReturnType<typeof createAdapter>,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.redisAdapter);
    return server;
  }
}
