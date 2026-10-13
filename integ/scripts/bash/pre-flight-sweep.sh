#!/bin/bash
#
# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Pre-flight sweep: deletes stale RFDK integ stacks older than the grace window.
# Stacks inside the grace window are left alone to protect parallel canary runs.

set -uo pipefail

REGION="${AWS_REGION:-${CDK_DEFAULT_REGION:-us-west-2}}"
PREFIX="RFDKInteg"
GRACE_HOURS=24
MAX_RETRIES=3
POLL_INTERVAL_SEC=30
POLL_TIMEOUT_SEC=3600

while [ $# -gt 0 ]; do
  case "$1" in
    --region)          REGION="$2"; shift 2;;
    --prefix)          PREFIX="$2"; shift 2;;
    --min-age-hours)   GRACE_HOURS="$2"; shift 2;;
    --max-retries)     MAX_RETRIES="$2"; shift 2;;
    -h|--help)
      cat <<EOF
Usage: $0 [--region <r>] [--prefix <p>] [--min-age-hours <n>] [--max-retries <n>]
Defaults: region=${REGION} prefix=${PREFIX} min-age-hours=${GRACE_HOURS} max-retries=${MAX_RETRIES}
EOF
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1;;
  esac
done

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) [pre-flight] $*" >&2; }

log "sweep start — region=${REGION} prefix=${PREFIX} grace=${GRACE_HOURS}h"

cutoff_epoch=$(( $(date -u +%s) - GRACE_HOURS * 3600 ))

stacks_output=$(
  aws cloudformation list-stacks --region "${REGION}" \
    --query "StackSummaries[?StackStatus!='DELETE_COMPLETE' && starts_with(StackName, '${PREFIX}')].[StackName, CreationTime, StackStatus]" \
    --output text
) || { log "ERROR: list-stacks failed (rc=$?)"; exit 1; }

all_stacks=()
if [ -n "${stacks_output}" ]; then
  while IFS= read -r line; do
    all_stacks+=("$line")
  done <<< "${stacks_output}"
fi

if [ "${#all_stacks[@]}" -eq 0 ]; then
  log "no stacks found — clean"
  exit 0
fi

# Terminal-failure states: always delete regardless of age.
ALWAYS_SWEEP_STATES=(ROLLBACK_COMPLETE ROLLBACK_FAILED UPDATE_ROLLBACK_FAILED DELETE_FAILED CREATE_FAILED)

is_always_sweep() {
  local s=$1
  for state in "${ALWAYS_SWEEP_STATES[@]}"; do
    [ "${state}" = "${s}" ] && return 0
  done
  return 1
}

to_delete=()
for row in "${all_stacks[@]}"; do
  name=$(echo "$row" | awk -F '\t' '{print $1}')
  created_iso=$(echo "$row" | awk -F '\t' '{print $2}' | sed 's/+00:00//;s/\..*//;s/Z$//;s/ /T/')
  status=$(echo "$row" | awk -F '\t' '{print $3}')

  if created_epoch=$(date -u -d "${created_iso}Z" +%s 2>/dev/null); then :
  elif created_epoch=$(date -u -j -f "%Y-%m-%dT%H:%M:%S" "${created_iso}" +%s 2>/dev/null); then :
  else
    log "WARN: can't parse time for ${name}, skipping"
    continue
  fi

  age_hours=$(( ( $(date -u +%s) - created_epoch ) / 3600 ))

  if is_always_sweep "${status}"; then
    log "delete: ${name} [${status}, ${age_hours}h, terminal]"
    to_delete+=("${name}")
  elif [ "${created_epoch}" -lt "${cutoff_epoch}" ]; then
    log "delete: ${name} [${status}, ${age_hours}h, stale]"
    to_delete+=("${name}")
  else
    log "skip:   ${name} [${status}, ${age_hours}h]"
  fi
done

if [ "${#to_delete[@]}" -eq 0 ]; then
  log "nothing to delete"
  exit 0
fi

log "${#to_delete[@]} stack(s) to delete"

# Wave 1: component stacks. Wave 2: infrastructure (owns shared VPC).
wave1=()
wave2=()
for stack in "${to_delete[@]}"; do
  case "${stack}" in
    "${PREFIX}Infrastructure"*) wave2+=("${stack}");;
    *)                          wave1+=("${stack}");;
  esac
done

declare -A attempts

fire_deletes() {
  local list=("$@")
  for stack in "${list[@]}"; do
    attempts[$stack]=$(( ${attempts[$stack]:-0} + 1 ))
    log "attempt ${attempts[$stack]}/${MAX_RETRIES}: ${stack}"

    # On the final attempt, query the stack for DELETE_FAILED resources and skip
    # them via --retain-resources so CFN can drop the stack metadata.
    if [ "${attempts[$stack]}" -ge "${MAX_RETRIES}" ]; then
      local failed_resources
      failed_resources=$(aws cloudformation describe-stack-resources --region "${REGION}" \
        --stack-name "${stack}" \
        --query "StackResources[?ResourceStatus=='DELETE_FAILED'].LogicalResourceId" \
        --output text 2>/dev/null | tr '\t' ' ')

      if [ -n "${failed_resources}" ]; then
        log "retaining stuck resources for ${stack}: ${failed_resources}"
        # shellcheck disable=SC2086
        aws cloudformation delete-stack --region "${REGION}" --stack-name "${stack}" \
          --retain-resources ${failed_resources} \
          || log "WARN: delete failed for ${stack}"
      else
        aws cloudformation delete-stack --region "${REGION}" --stack-name "${stack}" \
          || log "WARN: delete failed for ${stack}"
      fi
    else
      aws cloudformation delete-stack --region "${REGION}" --stack-name "${stack}" \
        || log "WARN: delete failed for ${stack}"
    fi
  done
}

poll_pending() {
  local list=("$@")
  for stack in "${list[@]}"; do
    local status
    status=$(aws cloudformation describe-stacks --region "${REGION}" \
      --stack-name "${stack}" \
      --query "Stacks[0].StackStatus" --output text 2>/dev/null || echo "GONE")

    case "${status}" in
      GONE|DELETE_COMPLETE)   log "done: ${stack}";;
      DELETE_FAILED)          log "WARN: ${stack} DELETE_FAILED"; failed+=("${stack}");;
      DELETE_IN_PROGRESS)     echo "${stack}";;
      *)                      log "WARN: ${stack} unexpected ${status}"; failed+=("${stack}");;
    esac
  done
}

process_wave() {
  local wave_label=$1; shift
  local pending=("$@")
  local wave_exit=0

  if [ "${#pending[@]}" -eq 0 ]; then return 0; fi
  log "${wave_label}: ${#pending[@]} stack(s)"

  while [ "${#pending[@]}" -gt 0 ]; do
    fire_deletes "${pending[@]}"

    local elapsed=0
    failed=()
    while [ "${#pending[@]}" -gt 0 ] && [ "${elapsed}" -lt "${POLL_TIMEOUT_SEC}" ]; do
      sleep "${POLL_INTERVAL_SEC}"
      elapsed=$(( elapsed + POLL_INTERVAL_SEC ))

      failed=()
      local new_pending=()
      while IFS= read -r still; do
        [ -n "${still}" ] && new_pending+=("${still}")
      done < <(poll_pending "${pending[@]}")
      pending=(${new_pending[@]+"${new_pending[@]}"})

      [ "${#pending[@]}" -gt 0 ] && log "${wave_label}: ${#pending[@]} pending (${elapsed}s)"
    done

    for stack in ${pending[@]+"${pending[@]}"}; do
      log "WARN: ${stack} timed out"; failed+=("${stack}")
    done

    local retry=()
    for stack in ${failed[@]+"${failed[@]}"}; do
      if [ "${attempts[$stack]:-0}" -lt "${MAX_RETRIES}" ]; then
        retry+=("${stack}")
      else
        log "ERROR: ${stack} failed after ${MAX_RETRIES} attempts"
        wave_exit=2
      fi
    done
    pending=(${retry[@]+"${retry[@]}"})
  done

  return ${wave_exit}
}

overall_exit=0
process_wave "wave-1" "${wave1[@]}" || overall_exit=$?
process_wave "wave-2" "${wave2[@]}" || overall_exit=$?

[ "${overall_exit}" -eq 0 ] && log "sweep done — ${#to_delete[@]} deleted" \
                             || log "sweep done with errors"
exit ${overall_exit}
