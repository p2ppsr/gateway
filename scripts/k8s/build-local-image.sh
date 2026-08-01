#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: ENVIRONMENT=staging|prod scripts/k8s/build-local-image.sh

Builds a Linux/amd64 Gateway image on a private deploy runner and pushes it to
the in-cluster registry.

Environment:
  ENVIRONMENT             staging, prod, or production. Required.
  SOURCE_SHA              Source commit SHA. Defaults to current git HEAD.
  IMAGE_TAG               Image tag. Defaults to <short-sha>-<env>-<utc-date>.
  REGISTRY_PUSH           Push registry. Defaults to 10.152.183.28:5000.
  REGISTRY_PULL           Pull registry written to outputs. Defaults to the
                          in-cluster registry service DNS name.
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
    ;;
  prod | production)
    env_slug="production"
    ;;
  *)
    printf 'Unsupported ENVIRONMENT=%s\n' "${ENVIRONMENT}" >&2
    usage
    exit 2
    ;;
esac

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

source_sha="${SOURCE_SHA:-$(git rev-parse HEAD)}"
short_sha="${source_sha:0:12}"
image_date="${IMAGE_DATE:-$(date -u +%F)}"
image_tag="${IMAGE_TAG:-${short_sha}-${env_slug}-${image_date}}"
registry_push="${REGISTRY_PUSH:-10.152.183.28:5000}"
registry_pull="${REGISTRY_PULL:-registry.cars-operator-system.svc.cluster.local:5000}"

push_image="${registry_push}/p2ppsr/gateway:${image_tag}"
pull_image="${registry_pull}/p2ppsr/gateway:${image_tag}"

printf 'Building Gateway %s image for %s\n' "${image_tag}" "${env_slug}"

docker build -f Dockerfile.local -t "${push_image}" .
docker push "${push_image}"

cat > release-manifest.json <<EOF
{
  "source_sha": "${source_sha}",
  "environment": "${env_slug}",
  "image_tag": "${image_tag}",
  "registry_push": "${registry_push}",
  "registry_pull": "${registry_pull}",
  "image": "${pull_image}"
}
EOF

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    printf 'image_tag=%s\n' "${image_tag}"
    printf 'image=%s\n' "${pull_image}"
  } >> "${GITHUB_OUTPUT}"
fi

printf 'Pushed image:\n'
printf '  %s\n' "${pull_image}"
