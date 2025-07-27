from denoland/deno:latest

WORKDIR /app

COPY . .

RUN deno cache main.ts

CMD ["deno", "run", "--allow-net", "main.ts"]
