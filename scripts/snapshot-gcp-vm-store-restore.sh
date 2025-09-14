#!/usr/bin/env bash
set -euo pipefail

# =========================
# CONFIG — adjust as needed
# =========================
PROJECT="computing-with-integrity"
ZONE="us-central1-f"
INSTANCE="gateway-box"

# Bucket must be globally unique; change if it collides.
BUCKET_NAME="${PROJECT}-vm-backups"
BUCKET_URI="gs://${BUCKET_NAME}"

# Local backup folder on your Mac
LOCAL_DIR="./backups"

# Backup folder on the VM
VM_DIR="/srv/gateway-deployment-backups"
# =========================


# --- helpers ---
msg()  { printf "\n\033[1;32m%s\033[0m\n" "$*"; }
warn() { printf "\n\033[1;33m%s\033[0m\n" "$*"; }
err()  { printf "\n\033[1;31m%s\033[0m\n" "$*"; }
die()  { err "$*"; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }

need gcloud
gcloud config set project "$PROJECT" >/dev/null

STAMP="$(date +%Y%m%d-%H%M)"
ARCHIVE_FROM_IMAGE() { echo "${1}.tar.gz"; }

get_boot_disk_name() {
  local inst="$1" zone="$2"
  local disk_uri
  disk_uri="$(gcloud compute instances describe "$inst" --zone="$zone" --format='value(disks[0].source)')" || return 1
  basename "$disk_uri"
}

get_machine_type() {
  local inst="$1" zone="$2"
  local mt_uri
  mt_uri="$(gcloud compute instances describe "$inst" --zone="$zone" --format='value(machineType)')" || return 1
  basename "$mt_uri"
}

get_tags_csv() {
  local inst="$1" zone="$2"
  # returns comma-separated tags or empty
  gcloud compute instances describe "$inst" --zone="$zone" --format='value(tags.items)' | tr ';' ',' || true
}

ensure_bucket() {
  if ! gcloud storage buckets describe "$BUCKET_URI" &>/dev/null; then
    msg "Creating storage bucket: $BUCKET_URI"
    gcloud storage buckets create "$BUCKET_URI" --location=US --uniform-bucket-level-access
  fi
}

ensure_vm_backup_dir() {
  gcloud compute ssh "$INSTANCE" --zone="$ZONE" \
    --command "sudo mkdir -p '$VM_DIR' && sudo chown -R bob:bob '$VM_DIR'"
}

create_snapshot_and_exports() {
  ensure_bucket
  ensure_vm_backup_dir

  local disk snapshot image archive
  disk="$(get_boot_disk_name "$INSTANCE" "$ZONE")" || die "Could not resolve boot disk."
  snapshot="${INSTANCE}-${STAMP}"
  image="${INSTANCE}-${STAMP}"
  archive="$(ARCHIVE_FROM_IMAGE "$image")"

  msg "Creating snapshot: $snapshot (disk: $disk)"
  gcloud compute disks snapshot "$disk" \
    --zone="$ZONE" \
    --snapshot-names="$snapshot" \
    --labels=vm="$INSTANCE",purpose=backup

  msg "Creating temporary image from snapshot: $image"
  gcloud compute images create "$image" \
    --source-snapshot="$snapshot" \
    --storage-location=US \
    --labels=vm="$INSTANCE",purpose=backup-temp

  msg "Exporting image to bucket: $BUCKET_URI/$archive"
  gcloud compute images export \
    --image="$image" \
    --destination-uri="${BUCKET_URI}/${archive}"

  msg "Downloading archive to Mac: ${LOCAL_DIR}/${archive}"
  mkdir -p "$LOCAL_DIR"
  gcloud storage cp "${BUCKET_URI}/${archive}" "${LOCAL_DIR}/${archive}"

  msg "Copying archive to VM: ${VM_DIR}/${archive}"
  gcloud compute scp "${LOCAL_DIR}/${archive}" "${INSTANCE}:${VM_DIR}/" --zone="$ZONE"

  msg "Cleaning up temporary image (snapshot retained): $image"
  gcloud compute images delete "$image" -q

  msg "Backup complete."
  echo "Snapshot:    $snapshot (kept in GCP)"
  echo "Mac file:    ${LOCAL_DIR}/${archive}"
  echo "VM file:     ${VM_DIR}/${archive}"
}

latest_snapshot_for_instance() {
  # latest snapshot that looks like INSTANCE-YYYYMMDD-HHMM
  gcloud compute snapshots list \
    --filter="name~'^${INSTANCE}-[0-9]{8}-[0-9]{4}$'" \
    --sort-by=~creationTimestamp \
    --limit=1 \
    --format='value(name)'
}

restore_clone_from_snapshot() {
  local snapshot="$1"
  [ -n "$snapshot" ] || die "Snapshot name required."

  local image new_instance mt tags
  image="${INSTANCE}-restore-${STAMP}"
  new_instance="${INSTANCE}-restore-${STAMP}"
  mt="$(get_machine_type "$INSTANCE" "$ZONE")" || die "Could not determine machine type."
  tags="$(get_tags_csv "$INSTANCE" "$ZONE")"

  msg "Creating image $image from snapshot $snapshot"
  gcloud compute images create "$image" \
    --source-snapshot="$snapshot" \
    --storage-location=US \
    --labels=vm="$INSTANCE",purpose=restore

  msg "Creating clone instance: $new_instance (type: $mt)"
  if [ -n "$tags" ]; then
    gcloud compute instances create "$new_instance" \
      --zone="$ZONE" \
      --machine-type="$mt" \
      --image="$image" \
      --tags="$tags"
  else
    gcloud compute instances create "$new_instance" \
      --zone="$ZONE" \
      --machine-type="$mt" \
      --image="$image"
  fi

  msg "Clone created. Fetching external IP (if any)…"
  gcloud compute instances describe "$new_instance" --zone="$ZONE" \
    --format="table(name,networkInterfaces[0].accessConfigs[0].natIP, status)"

  warn "Test the clone. When satisfied, you can swap DNS or move the static IP to the clone."
}

restore_inplace_from_snapshot() {
  local snapshot="$1"
  [ -n "$snapshot" ] || die "Snapshot name required."

  local old_disk new_disk
  old_disk="$(get_boot_disk_name "$INSTANCE" "$ZONE")" || die "Could not resolve old boot disk."
  new_disk="${old_disk}-from-${snapshot//_/}-$(date +%H%M%S)"

  msg "Creating new disk $new_disk from snapshot $snapshot"
  gcloud compute disks create "$new_disk" \
    --source-snapshot="$snapshot" \
    --zone="$ZONE"

  msg "Stopping instance for in-place restore: $INSTANCE"
  gcloud compute instances stop "$INSTANCE" --zone="$ZONE"

  msg "Detaching old boot disk: $old_disk"
  gcloud compute instances detach-disk "$INSTANCE" \
    --zone="$ZONE" \
    --disk="$old_disk"

  msg "Attaching new disk as boot: $new_disk"
  gcloud compute instances attach-disk "$INSTANCE" \
    --zone="$ZONE" \
    --disk="$new_disk" \
    --boot \
    --mode=rw

  msg "Starting instance: $INSTANCE"
  gcloud compute instances start "$INSTANCE" --zone="$ZONE"

  warn "In-place restore finished. Old boot disk retained: $old_disk
You may delete it later once fully confident:
  gcloud compute disks delete \"$old_disk\" --zone=\"$ZONE\"
"
}

prompt_default_yes() {
  # usage: prompt_default_yes "Question?"
  local prompt="$1" ans
  read -r -p "$prompt [Y/n] " ans || true
  ans="${ans:-Y}"
  [[ "$ans" =~ ^[Yy]$ ]]
}

prompt_default_no() {
  local prompt="$1" ans
  read -r -p "$prompt [y/N] " ans || true
  ans="${ans:-N}"
  [[ "$ans" =~ ^[Yy]$ ]]
}

# =========================
# Flow
# =========================

msg "Project: $(gcloud config get-value project)  Zone: $ZONE  Instance: $INSTANCE"

if prompt_default_yes "Create snapshot & export backup now?"; then
  create_snapshot_and_exports
else
  warn "Skipped backup."
fi

if prompt_default_no "Restore from a snapshot now?"; then
  # Choose snapshot (default latest)
  LATEST="$(latest_snapshot_for_instance || true)"
  echo
  echo "Available snapshots (newest first):"
  gcloud compute snapshots list \
    --filter="name~'^${INSTANCE}-[0-9]{8}-[0-9]{4}$'" \
    --sort-by=~creationTimestamp \
    --format="table(name,creationTimestamp,status)" \
    | sed '1,1!b' || true

  read -r -p "Snapshot to restore [default: ${LATEST:-<none>}]: " SNAP
  SNAP="${SNAP:-$LATEST}"
  [ -n "$SNAP" ] || die "No snapshot selected."

  echo
  echo "Restore mode:"
  echo "  1) Clone (safe, creates ${INSTANCE}-restore-YYYYMMDD-HHMM)"
  echo "  2) In-place (downtime; replaces boot disk on ${INSTANCE})"
  read -r -p "Choose [1/2] (default: 1): " MODE
  MODE="${MODE:-1}"

  case "$MODE" in
    1) restore_clone_from_snapshot "$SNAP" ;;
    2) restore_inplace_from_snapshot "$SNAP" ;;
    *) die "Invalid selection." ;;
  esac
else
  msg "No restore requested."
fi

msg "All done."
