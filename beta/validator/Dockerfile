FROM solanalabs/solana:stable

# gettext-base provides envsubst (used to inject $PORT into nginx config)
RUN apt-get update && apt-get install -y nginx gettext-base && rm -rf /var/lib/apt/lists/*

# Store nginx config as a template so entrypoint can substitute $PORT at runtime
COPY nginx.conf /etc/nginx/nginx.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

RUN mkdir -p /data/ledger

# Override the base image ENTRYPOINT so our script runs directly
ENTRYPOINT ["/entrypoint.sh"]
