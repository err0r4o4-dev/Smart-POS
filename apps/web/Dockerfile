FROM node:24-alpine AS development
WORKDIR /workspace
RUN chown node:node /workspace
USER node
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node apps/web/package.json apps/web/package.json
RUN npm ci
COPY --chown=node:node apps/web apps/web
COPY --chown=node:node packages/contracts packages/contracts
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "@smartpos/web", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM node:24-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN npm run build

FROM caddy:2.10-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/web/dist /srv
USER 10001:10001
EXPOSE 5173
