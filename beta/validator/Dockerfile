FROM solanalabs/solana:v2.2.0

RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /data/ledger

EXPOSE 80

CMD ["/entrypoint.sh"]
