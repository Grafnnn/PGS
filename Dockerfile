FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl ca-certificates
RUN corepack enable && corepack prepare pnpm@11.5.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl ca-certificates
RUN corepack enable && corepack prepare pnpm@11.5.3 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl ca-certificates
RUN corepack enable && corepack prepare pnpm@11.5.3 --activate
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
EXPOSE 3000
# Run the binaries already baked into the image so startup never depends on registry availability.
CMD ["sh", "-c", "node ./node_modules/prisma/build/index.js migrate deploy && node --import tsx prisma/seed.ts && node ./node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
