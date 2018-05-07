FROM node:alpine

RUN apk add --no-cache make gcc g++ python git bash

COPY . /src/ark-json-rpc

RUN cd /src/ark-json-rpc \
    && npm install -g pm2 \
    && npm install

WORKDIR /src/ark-json-rpc
ENTRYPOINT ["sh", "-c", "pm2 --no-daemon start ./bin/server -- start $@" ]

EXPOSE 8080
