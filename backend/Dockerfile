FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=vibetix-pnpm-store,target=/pnpm/store,sharing=locked pnpm install --store-dir=/pnpm/store --frozen-lockfile
COPY backend backend
COPY packages packages
COPY src/data src/data
COPY src/types src/types
COPY src/api/client.ts src/api/client.ts
COPY scripts/ops scripts/ops
RUN pnpm exec prisma generate --schema backend/prisma/schema.prisma && pnpm --filter @vibetix/backend build
RUN node -e 'const fs=require("node:fs"),p=require("node:path");fs.cpSync(p.resolve(p.dirname(require.resolve("@prisma/client")),"../../.prisma/client"),"/app/runtime-prisma",{recursive:true})'
USER node

FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370 AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=vibetix-pnpm-store,target=/pnpm/store,sharing=locked pnpm install --store-dir=/pnpm/store --prod --frozen-lockfile --ignore-scripts
COPY --from=build /app/runtime-prisma /opt/runtime-prisma
RUN node -e 'const fs=require("node:fs"),p=require("node:path");fs.cpSync("/opt/runtime-prisma",p.resolve(p.dirname(require.resolve("@prisma/client")),"../../.prisma/client"),{recursive:true});fs.rmSync("/opt/runtime-prisma",{recursive:true})'
COPY --from=build /app/backend/dist backend/dist
COPY scripts/stage2 scripts/stage2
RUN mkdir -p /app/artifacts/local-emails && chown -R node:node /app/artifacts
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "backend/dist/backend/src/server.js"]
