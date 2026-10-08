FROM golang:1.26-alpine AS base
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .

FROM base AS check
RUN apk add --no-cache build-base
CMD ["sh", "-c", "test -z \"$(gofmt -l .)\" && go vet ./... && go test -race ./... && go build ./cmd/server"]

FROM base AS build
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.23 AS runtime
RUN apk add --no-cache ca-certificates && addgroup -S app && adduser -S app -G app
COPY --from=build /out/server /usr/local/bin/server
USER app
EXPOSE 8080
CMD ["server"]
