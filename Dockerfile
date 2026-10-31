FROM node:24-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /waterway

# SkeldJS is built from git into ./skeldjs and linked by package.json (link: deps)
ARG SKELDJS_REPO=https://github.com/SkeldJS/SkeldJS.git
ARG SKELDJS_REF=master
ENV SKELDJS_REPO=${SKELDJS_REPO} \
    SKELDJS_REF=${SKELDJS_REF}

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
COPY scripts ./scripts
RUN node ./scripts/fetchSkeldjs.js

RUN yarn install --immutable

COPY tsconfig.json ./
COPY src ./src
COPY bin ./bin
RUN yarn build

# Drop typescript/typedoc from the linked workspace, only built output is needed at runtime
WORKDIR /waterway/skeldjs
RUN yarn workspaces focus --all --production

FROM node:24-bookworm-slim
WORKDIR /waterway

ENV NODE_ENV=production

COPY --from=build /waterway/node_modules ./node_modules
COPY --from=build /waterway/skeldjs ./skeldjs
COPY --from=build /waterway/dist ./dist
COPY --from=build /waterway/package.json ./

# Mount your config.json into /waterway (or run `yarn setup` on first start)
EXPOSE 22023 22123/udp
CMD ["node", "./dist/bin/bootstrap"]
