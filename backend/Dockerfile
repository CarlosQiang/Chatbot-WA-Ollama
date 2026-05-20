# ---------- Stage 1: deps + prisma generate ----------
# Aquí descargamos paquetes y los engines de Prisma — necesita red.
# Si package.json/schema no cambian, este stage queda cacheado para siempre.
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY prisma ./prisma
# Reintenta hasta 3 veces si la red falla momentáneamente
RUN for i in 1 2 3; do npx prisma generate && break || (echo "Prisma generate intento $i falló, reintentando..." && sleep 3); done

# ---------- Stage 2: build (sin red) ----------
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .
RUN npm run build

# ---------- Stage 3: runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat wget

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

RUN mkdir -p /app/data
EXPOSE 3411

CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node dist/main.js"]
