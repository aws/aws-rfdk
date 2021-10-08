#!/bin/bash

set -euo pipefail

echo "Running python tests"

python3 -m unittest discover -s "$PWD/lib/deadline/scripts/python" -b

exit 0
