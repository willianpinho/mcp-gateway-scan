# MCP server image for Glama (https://glama.ai/mcp/servers) introspection and
# for anyone who prefers a container over `npx`. Starts the read-only stdio MCP
# server that exposes the single `scan_gateway` tool. Glama only needs the server
# to start and answer introspection (initialize + tools/list) over stdio.

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile
COPY src ./src
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist

# stdio transport: nothing but JSON-RPC may go to stdout (the server already
# routes diagnostics to stderr). `mcp` is the subcommand that starts the server.
ENTRYPOINT ["node", "dist/cli.js", "mcp"]
