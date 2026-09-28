# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/battle-worker/package.json apps/battle-worker/package.json
COPY packages/poke-lounge-battle/package.json packages/poke-lounge-battle/package.json

RUN pnpm install --frozen-lockfile

COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_POKE_BACKEND=nest
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_POKE_BACKEND=$NEXT_PUBLIC_POKE_BACKEND

RUN pnpm --filter @poke-lounge/api rom-data:check
RUN pnpm check:poke-lounge-competitive-catalog

RUN pnpm build:poke-lounge-battle
RUN pnpm --filter @poke-lounge/battle-worker build
RUN pnpm --filter @poke-lounge/web build
RUN pnpm --filter @poke-lounge/api build

ENV NODE_ENV=production

EXPOSE 3000 3001 3021

CMD ["pnpm", "--filter", "@poke-lounge/web", "start"]
