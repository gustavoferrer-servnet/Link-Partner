#!/bin/sh
set -eu
TASK_RELEASE_ROOT=/Users/gustavo.ferrer/link-partner-releases/0.3.0-cx-20261008
TASK_ACTIVE_DEPLOY=/Users/gustavo.ferrer/link-partner-releases/0.2.0-20261008-1/deploy
TASK_RUNTIME_ROOT=/Users/gustavo.ferrer/link-partner-cx
mkdir -p "$TASK_RUNTIME_ROOT"
tar -xzf /Users/gustavo.ferrer/link-partner-operations-cx-0.3.0.tgz -C "$TASK_RELEASE_ROOT"
cp "$TASK_RELEASE_ROOT/docker-compose.api-cx.override.yml" "$TASK_RELEASE_ROOT/deploy/docker-compose.api-cx.override.yml"
cd "$TASK_RELEASE_ROOT"
docker build --pull=false -t link-partner-web:0.3.0-cx -f Dockerfile.operations.cx-update .
python3 -c 'import os,secrets; p="/Users/gustavo.ferrer/link-partner-cx/runtime.env"; exists=os.path.exists(p); fd=None if exists else os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); stream=None if fd is None else os.fdopen(fd,"w"); stream is None or stream.write("GEOCODING_SIGNING_SECRET="+secrets.token_hex(32)+"\n"); stream is None or stream.close(); os.chmod(p,0o600)'
docker exec link-partner-staging-link-partner-api-1 node -e 'const fs=require("fs");fs.mkdirSync("/app/data/backups",{recursive:true});try{fs.copyFileSync("/app/data/link-partner-state.json","/app/data/backups/pre-cx-20261008.json",fs.constants.COPYFILE_EXCL)}catch(error){if(error.code!=="EEXIST")throw error;}console.log("Cobertura respaldada antes de actualizar API.")'
docker compose -p link-partner-staging --env-file "$TASK_ACTIVE_DEPLOY/ai-stg-node02.env" --env-file "$TASK_RUNTIME_ROOT/runtime.env" -f "$TASK_ACTIVE_DEPLOY/docker-compose.staging.yml" -f "$TASK_RELEASE_ROOT/deploy/docker-compose.api-cx.override.yml" config --quiet
docker compose -p link-partner-staging --env-file "$TASK_ACTIVE_DEPLOY/ai-stg-node02.env" --env-file "$TASK_RUNTIME_ROOT/runtime.env" -f "$TASK_ACTIVE_DEPLOY/docker-compose.staging.yml" -f "$TASK_RELEASE_ROOT/deploy/docker-compose.api-cx.override.yml" up -d --no-deps --no-build --wait --wait-timeout 120 link-partner-api link-partner-web
docker compose -p link-partner-cx -f "$TASK_RELEASE_ROOT/deploy/docker-compose.cx.yml" up -d --no-build --wait --wait-timeout 90
docker ps --filter name=link-partner --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'
