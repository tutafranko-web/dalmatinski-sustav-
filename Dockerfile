FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
COPY public ./public
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/health || exit 1
# izravno node (ne npx): nema skidanja paketa pri startu, a SIGTERM stiže do aplikacije
CMD ["node", "--import", "tsx", "src/index.ts"]
