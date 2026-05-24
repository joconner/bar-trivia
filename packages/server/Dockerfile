# Single-stage ts-node runtime — skip compiled output because @bar-trivia/shared
# has noEmit:true and exports TypeScript source directly via tsconfig paths.
FROM node:22-alpine

# python3/make/g++ for @node-rs/argon2 native build; openssl for Prisma binary
RUN apk add --no-cache python3 make g++ openssl

WORKDIR /app

# Copy manifests first so npm ci is cached independently of source changes
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared/ ./packages/shared/
COPY packages/server/ ./packages/server/

# Generate the Prisma client (requires schema + node_modules)
RUN cd packages/server && npx prisma generate

EXPOSE 3000

# prisma db push syncs the schema to the fresh postgres instance at startup.
# ts-node with tsconfig-paths resolves @bar-trivia/shared → ../shared/src/index.ts.
ENTRYPOINT ["sh", "-c", "cd /app/packages/server && npx prisma db push && npx ts-node -r tsconfig-paths/register src/main.ts"]
