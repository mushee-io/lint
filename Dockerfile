FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ARG DATABASE_URL=postgresql://marketlint:marketlint@localhost:5432/marketlint
ENV DATABASE_URL=$DATABASE_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app .
EXPOSE 3000
CMD ["npm", "start"]
