FROM golang:1.25-alpine AS build

WORKDIR /src

RUN apk add --no-cache ca-certificates git

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/server .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/seed ./cmd/seed

FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata wget

WORKDIR /app

COPY --from=build /out/server /app/server
COPY --from=build /out/seed /app/seed

ENV PORT=8080 \
	UPLOAD_DIR=/data/uploads

RUN mkdir -p /data/uploads

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
	CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["/app/server"]
