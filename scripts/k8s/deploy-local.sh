#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: ENVIRONMENT=staging|prod IMAGE_TAG=<tag> scripts/k8s/deploy-local.sh

Applies the Gateway Kubernetes overlay to the private production cluster with a
runtime image tag override and creates/updates the gateway-secrets Secret.

Environment:
  ENVIRONMENT             staging, prod, or production. Required.
  IMAGE_TAG               Image tag to deploy. Required unless SOURCE_SHA is set.
  SOURCE_SHA              Used to derive IMAGE_TAG when IMAGE_TAG is unset.
  REGISTRY_PULL           Pull registry. Defaults to the in-cluster registry DNS.
  KUBECTL                 kubectl command. Defaults to kubectl.
  DRY_RUN                 Set to server or client to apply a dry-run only.
  WAIT_FOR_CERT           Set to false to skip Certificate readiness wait.

Required secret environment:
  SERVER_PRIVATE_KEY SQL_DATABASE_USER SQL_DATABASE_PASSWORD

Optional secret environment:
  SQL_DATABASE_HOST SQL_DATABASE_PORT SQL_DATABASE_DB_NAME ROUTING_PREFIX
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "${ENVIRONMENT:-}" ]]; then
  usage
  exit 2
fi

case "${ENVIRONMENT}" in
  staging)
    env_slug="staging"
    namespace="gateway-staging"
    overlay="staging"
    host="staging-app.gateway.cash"
    default_db_name="staging_gateway"
    ;;
  prod | production)
    env_slug="production"
    namespace="gateway-prod"
    overlay="prod"
    host="app.gateway.cash"
    default_db_name="gateway"
    ;;
  *)
    printf 'Unsupported ENVIRONMENT=%s\n' "${ENVIRONMENT}" >&2
    usage
    exit 2
    ;;
esac

required_vars=(
  SERVER_PRIVATE_KEY
  SQL_DATABASE_USER
  SQL_DATABASE_PASSWORD
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    printf 'Missing required environment variable: %s\n' "${var_name}" >&2
    exit 2
  fi
done

if [[ -z "${IMAGE_TAG:-}" ]]; then
  if [[ -z "${SOURCE_SHA:-}" ]]; then
    usage
    exit 2
  fi
  IMAGE_TAG="${SOURCE_SHA:0:12}-${env_slug}-$(date -u +%F)"
fi

repo_root="$(git rev-parse --show-toplevel)"
registry_pull="${REGISTRY_PULL:-registry.cars-operator-system.svc.cluster.local:5000}"
kubectl_cmd="${KUBECTL:-kubectl}"
dry_run="${DRY_RUN:-}"
wait_for_cert="${WAIT_FOR_CERT:-true}"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

mkdir -p "${tmp_dir}/infra"
cp -R "${repo_root}/infra/kubernetes" "${tmp_dir}/infra/kubernetes"

overlay_dir="${tmp_dir}/infra/kubernetes/overlays/${overlay}"
kustomization="${overlay_dir}/kustomization.yaml"

export IMAGE_TAG REGISTRY_PULL="${registry_pull}"
perl -0pi -e 's#newName: [^\n]*/p2ppsr/gateway#newName: $ENV{REGISTRY_PULL}/p2ppsr/gateway#g' "${kustomization}"
perl -0pi -e 's#newTag: [^\n]+#newTag: $ENV{IMAGE_TAG}#g' "${kustomization}"

secret_env_file="${tmp_dir}/gateway-secrets.env"
umask 077
printf 'SERVER_PRIVATE_KEY=%s\n' "${SERVER_PRIVATE_KEY}" >> "${secret_env_file}"
printf 'SQL_DATABASE_USER=%s\n' "${SQL_DATABASE_USER}" >> "${secret_env_file}"
printf 'SQL_DATABASE_PASSWORD=%s\n' "${SQL_DATABASE_PASSWORD}" >> "${secret_env_file}"
printf 'SQL_DATABASE_DB_NAME=%s\n' "${SQL_DATABASE_DB_NAME:-${default_db_name}}" >> "${secret_env_file}"
for var_name in SQL_DATABASE_HOST SQL_DATABASE_PORT ROUTING_PREFIX; do
  if [[ -n "${!var_name:-}" ]]; then
    printf '%s=%s\n' "${var_name}" "${!var_name}" >> "${secret_env_file}"
  fi
done

printf 'Deploying Gateway %s image tag %s to namespace %s\n' "${env_slug}" "${IMAGE_TAG}" "${namespace}"

if [[ -n "${dry_run}" ]]; then
  "${kubectl_cmd}" apply --dry-run="${dry_run}" -f "${overlay_dir}/namespace.yaml"
  "${kubectl_cmd}" -n "${namespace}" create secret generic gateway-secrets \
    --from-env-file="${secret_env_file}" \
    --dry-run=client \
    -o yaml | "${kubectl_cmd}" apply --dry-run="${dry_run}" -f -
  "${kubectl_cmd}" kustomize "${overlay_dir}" | \
    "${kubectl_cmd}" apply --dry-run="${dry_run}" -f -
  exit 0
fi

"${kubectl_cmd}" apply -f "${overlay_dir}/namespace.yaml"
"${kubectl_cmd}" -n "${namespace}" create secret generic gateway-secrets \
  --from-env-file="${secret_env_file}" \
  --dry-run=client \
  -o yaml | "${kubectl_cmd}" apply -f -
"${kubectl_cmd}" kustomize "${overlay_dir}" | "${kubectl_cmd}" apply -f -
"${kubectl_cmd}" -n "${namespace}" rollout status deployment/gateway-app --timeout=10m
if [[ "${wait_for_cert}" != "false" ]]; then
  "${kubectl_cmd}" -n "${namespace}" wait --for=condition=Ready certificate/gateway-app-tls --timeout=15m
else
  printf 'Skipping certificate readiness wait for %s\n' "${host}"
fi

curl_pod="gateway-smoke-${env_slug}-$(date +%s)"
"${kubectl_cmd}" -n "${namespace}" run "${curl_pod}" \
  --quiet \
  --rm \
  -i \
  --restart=Never \
  --image=curlimages/curl:8.11.1 \
  --command -- sh -ec '
    health="$(curl --fail --show-error --silent http://gateway-app:8080/healthz)"
    printf "%s" "${health}" | grep -q "\"ok\":true"
    curl --fail --show-error --silent --output /dev/null http://gateway-app:8080/
    curl --fail --show-error --silent --output /dev/null http://gateway-app:8080/pay.js
  '

printf 'Gateway %s deployment completed for image tag %s (%s)\n' "${env_slug}" "${IMAGE_TAG}" "${host}"
