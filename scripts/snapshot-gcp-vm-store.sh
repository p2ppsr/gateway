#!/usr/bin/env bash
set -euo pipefail

# === CONFIG ===
PROJECT="computing-with-integrity"
ZONE="us-central1-f"
INSTANCE="gateway-box"
# Bucket must be globally unique; change if it collides
BUCKET_NAME="${PROJECT}-vm-backups"
BUCKET_URI="gs://${BUCKET_NAME}"
LOCAL_DIR="./backups"                         # where to store on your Mac
VM_DIR="/srv/gateway-deployment-backups"      # where to store on the VM
# ==============

gcloud config set project "$PROJECT" >/dev/null

# Ensure backup bucket exists
if ! gcloud storage buckets describe "$BUCKET_URI" &>/dev/null; then
  gcloud storage buckets create "$BUCKET_URI" --location=US --uniform-bucket-level-access
fi

# Identify boot disk
DISK_URI="$(gcloud compute instances describe "$INSTANCE" --zone="$ZONE" --format='value(disks[0].source)')"
DISK="${DISK_URI##*/}"

STAMP="$(date +%Y%m%d-%H%M)"
SNAPSHOT="${INSTANCE}-${STAMP}"
IMAGE="${INSTANCE}-${STAMP}"
ARCHIVE="${IMAGE}.tar.gz"

echo "-> Creating snapshot ${SNAPSHOT} of disk ${DISK}…"
gcloud compute disks snapshot "$DISK" \
  --zone="$ZONE" \
  --snapshot-names="$SNAPSHOT" \
  --labels=vm="$INSTANCE",purpose=backup

echo "-> Creating temporary image ${IMAGE} from snapshot…"
gcloud compute images create "$IMAGE" \
  --source-snapshot="$SNAPSHOT" \
  --storage-location=US \
  --labels=vm="$INSTANCE",purpose=backup-temp

echo "-> Exporting image to ${BUCKET_URI}/${ARCHIVE}…"
gcloud compute images export \
  --image="$IMAGE" \
  --destination-uri="${BUCKET_URI}/${ARCHIVE}"

echo "-> Downloading archive to Mac (${LOCAL_DIR})…"
mkdir -p "$LOCAL_DIR"
gcloud storage cp "${BUCKET_URI}/${ARCHIVE}" "${LOCAL_DIR}/${ARCHIVE}"

echo "-> Copying archive to VM (${VM_DIR})…"
gcloud compute ssh "$INSTANCE" --zone="$ZONE" --command "sudo mkdir -p '$VM_DIR' && sudo chown -R bob:bob '$VM_DIR'"
gcloud compute scp "${LOCAL_DIR}/${ARCHIVE}" "${INSTANCE}:${VM_DIR}/" --zone="$ZONE"

echo "-> Cleaning up temporary image (snapshot retained)…"
gcloud compute images delete "$IMAGE" -q

echo "Done."
echo "Snapshot:   ${SNAPSHOT} (in GCP)"
echo "Mac file:   ${LOCAL_DIR}/${ARCHIVE}"
echo "VM file:    ${VM_DIR}/${ARCHIVE}"

# Verify
ls -lh "./backups/${INSTANCE}-"*.tar.gz
gcloud compute snapshots list --filter="name=${SNAPSHOT}" --format="table(name,creationTimestamp,status)"
gcloud compute ssh gateway-box --zone=us-central1-f --command "ls -lh /srv/gateway-deployment-backups/"
