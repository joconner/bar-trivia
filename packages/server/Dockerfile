# Single-stage ts-node runtime. The @bar-trivia/shared workspace has no build
# script and exports .ts source directly (package.json main → ./src/index.ts),
# so the server runs from source instead of compiling. npm workspaces symlinks
# resolve @bar-trivia/shared imports.
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

# prisma db push syncs the schema to the postgres instance at startup.
ENTRYPOINT ["sh", "-c", "cd /app/packages/server && npx prisma db push && npx ts-node src/main.ts"]
