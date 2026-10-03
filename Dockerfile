FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1
FROM base AS dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
FROM dependencies AS build
COPY . .
RUN npm run build
# Use this target as a one-off release job before starting the new app version.
FROM dependencies AS migrate
CMD ["npm", "run", "db:deploy"]
FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 treviqo && useradd --system --uid 1001 --gid treviqo treviqo
COPY --from=build --chown=treviqo:treviqo /app/.next/standalone ./
COPY --from=build --chown=treviqo:treviqo /app/.next/static ./.next/static
COPY --from=build --chown=treviqo:treviqo /app/public ./public
USER treviqo
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
