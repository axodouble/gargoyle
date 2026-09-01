FROM oven/bun:debian

WORKDIR /workspace/gargoyle

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    lib32gcc-s1 \
    lib32stdc++6 \
    && rm -rf /var/lib/apt-get/lists/*

RUN mkdir -p /opt/steamcmd && cd /opt/steamcmd \
    && curl -sqL "https://client-update.steamstatic.com/installer/steamcmd_linux.tar.gz" | tar zxvf -

HEALTHCHECK --interval=30s --timeout=10s --retries=3 CMD curl --fail http://localhost:3000/health || exit 1

EXPOSE 3001 

RUN apt-get update && apt-get install -y git curl ffmpeg espeak-ng \
	&& apt-get install -y build-essential libcairo2-dev libpango1.0-dev libgif-dev libjpeg-dev

COPY package.json ./package.json

RUN bun install

RUN rm ./package.json

CMD ["sh", "-c", "bun run db:migrate && echo '' && bun run --watch ."]