set -euo pipefail

echo "Cleaning aws-rfdk..."

rm -rf ./node_modules/

 if [ -f ./.jsii ]; then
     rm ./.jsii
 fi
 if [ -f ./tsconfig.json ]; then
     rm ./tsconfig.json
 fi

echo "Done aws-rfdk"
