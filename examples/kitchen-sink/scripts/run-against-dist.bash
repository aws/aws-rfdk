# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Helper functions to go with 'run-against-dist'
# NPM Workspace. Will have CDK CLI and verdaccio installed into it.


function log() {
  echo >&2 "| $@"
}

function header() {
  log
  log "============================================================================================"
  log $@
  log "============================================================================================"
}

function mktempdir() {
  local tempdir="$(mktemp -d)"
  echo "$tempdir"
}

function serve_npm_packages() {
  if  [ $# -ne 1 ]; then
    echo "Must pass in directory as an argument. Use mktempdir() for a temporary directory"
    exit 1
  fi
  npmws=$1

  if [ -n "${VERDACCIO_PID:-}" ]; then
    log "verdaccio is already running"
    use_verdaccio
    return
  fi

  # We only want tgz files that JSII ran on
  tarballs=$dist_root/js/*jsii.tgz

  log "Discovering local package names..."
  # Read the package names from each tarball, so that we can generate
  # a Verdaccio config that will keep each of these packages locally
  # and not go to NPMJS for it.
  package_names=""
  for tgz in $tarballs; do
    name=$(node -pe 'JSON.parse(process.argv[1]).name' "$(tar xOzf $tgz package/package.json)")
    package_names="$package_names $name"
  done

  #-----------------------------
  # Start a local npm repository
  #-----------------------------
  header "Starting local NPM Repository"
  local verdaccio_config="${npmws}/config.yaml"

  verdacciobin=$(type -p verdaccio) || {
    (cd $npmws && npm install --no-save verdaccio)
    verdacciobin=$npmws/node_modules/.bin/verdaccio
  }

  # start consumer verdaccio with npm
  header "Starting verdaccio (with npm uplink)"
  write_verdaccio_config "${verdaccio_config}" "$package_names"
  $verdacciobin --config "${verdaccio_config}" &
  local pid=$!
  trap "echo 'shutting down verdaccio'; kill ${pid} || true" EXIT
  log "waiting for verdaccio to start..."
  sleep 1
  log "consumer verdaccio pid: ${pid}"

  export VERDACCIO_PID=$pid

  use_verdaccio

  log "Publishing NPM tarballs..."
  for tgz in $tarballs; do
    # Doesn't matter what directory it is, just shouldn't be the
    # aws-cdk package directory.
    (cd $npmws && npm --quiet publish $tgz)
  done
}

function write_verdaccio_config() {
  local verdaccio_config="$1"
  local packages="${2:-}"

  cat > "${verdaccio_config}" <<HERE
storage: ${npmws}/storage
uplinks:
  npmjs:
    url: https://registry.npmjs.org
    cache: false
max_body_size: '100mb'
publish:
  allow_offline: true
logs:
  - {type: file, path: '$npmws/verdaccio.log', format: pretty, level: info}
packages:
HERE

  # List of packages we're expecting to publish into the server,
  # so for all of these we explicitly configure a missing upstream server.
  for package in $packages; do
    cat >> "${verdaccio_config}" <<HERE
  '${package}':
    access: \$all
    publish: \$all
HERE
  done

    cat >> "${verdaccio_config}" <<HERE
  '**':
    access: \$all
    publish: \$all
    proxy: npmjs
HERE

  cat >&2 ${verdaccio_config}
}

function use_verdaccio() {
  log "configuring npm to use verdaccio"

  # Token MUST be passed via .npmrc: https://github.com/npm/npm/issues/15565
  export npm_config_userconfig="${npmws}/.npmrc"
  echo "//localhost:4873/:_authToken=none" >> ${npm_config_userconfig}
  echo "" >> ${npm_config_userconfig}

  # Pass registry via environment variable, so that if this script gets run via 'npm run'
  # and all $npm_config_xxx settings are passed via environment variables, we still
  # get to override it (the file would normally be ignored in that case).
  export npm_config_registry=http://localhost:4873/
}
