FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
WORKDIR /opt/astraea
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /opt/astraea
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /opt/astraea/dist ./dist
COPY --from=build /opt/astraea/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
USER node
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/prisma/seed.js && exec node dist/src/index.js"]
