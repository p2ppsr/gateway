#!/bin/bash

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