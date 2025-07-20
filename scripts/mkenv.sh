#!/bin/bash
#!/bin/bash

# ─────────────────────────────────────────────────────────────────────────────
# Script Name: generate-knative-service.sh
#
# Description:
#   This script generates a Knative Service YAML definition by injecting the
#   required environment variables and memory limits. It is designed to be run
#   from a configured shell session with the required variables exported.
#
# Usage:
#   ./generate-knative-service.sh output.yaml
#
#   Where `output.yaml` is the desired name for the generated Knative service file.
#
# Required Environment Variables:
#   - SERVICE                : Name of the Knative service
#   - IMAGE                  : Docker image to deploy
#   - NODE_ENV               : Node environment setting (e.g. "production")
#   - BSV_NETWORK            : Blockchain network (e.g. "mainnet", "testnet")
#   - ROUTING_PREFIX         : URL routing prefix for the app
#   - SERVER_PRIVATE_KEY     : Server-side private key
#   - HOSTING_DOMAIN         : Domain to serve the app on
#   - SPAWN_NGINX            : Whether to spawn Nginx reverse proxy (e.g. "true")
#   - SQL_DATABASE_HOST      : SQL DB hostname
#   - SQL_DATABASE_PORT      : SQL DB port
#   - SQL_DATABASE_USER      : SQL DB username
#   - SQL_DATABASE_PASSWORD  : SQL DB password
#   - SQL_DATABASE_DB_NAME   : SQL DB name
#   - HTTP_PORT              : Internal HTTP port (typically 8080)
#
# Output:
#   - A YAML file at the path given by $1, containing a ready-to-deploy Knative
#     service definition.
#
# Example:
#   SERVICE=gateway-api IMAGE=gcr.io/my-project/gateway-api:latest \
#   ./generate-knative-service.sh gateway-api.yaml
# ─────────────────────────────────────────────────────────────────────────────

# Memory limit for the container
MEMORY_LIMIT="4Gi" # Example: 512Mi, 1Gi, etc.

echo "Creating $1"
echo "apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: $SERVICE
  labels:
    cloud.googleapis.com/location: us-west1
spec:
  template:
    spec:
      timeoutSeconds: 3540
      containers:
      - image: $IMAGE
        ports:
        - name: h2c
          containerPort: 8080
        resources:
          limits:
            memory: $MEMORY_LIMIT
        env:" > $1

echo "Appending environment variables to $1"

echo "Appending to $1"
perl -E'
  say "        - name: $_
          value: \x27$ENV{$_}\x27" for @ARGV;
' NODE_ENV BSV_NETWORK ROUTING_PREFIX SERVER_PRIVATE_KEY HOSTING_DOMAIN SPAWN_NGINX SQL_DATABASE_HOST SQL_DATABASE_PORT SQL_DATABASE_USER SQL_DATABASE_PASSWORD SQL_DATABASE_DB_NAME HTTP_PORT >> $1

echo "Built! Contents of $1:"
cat $1