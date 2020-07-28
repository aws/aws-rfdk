#!/bin/bash
# Generate an aggregate tsconfig.json with references to all projects in the
# repository.
prefix="$(pwd)/"

echo '{'
echo '    "__comment__": "This file is necessary to make transitive Project References in TypeScript work",'
echo '    "files": [],'
echo '    "references": ['

# set the comma to nothing at first.
# if we have more than one package,
# we set $comma to an actual comma
comma='  '
for package in $(node_modules/.bin/lerna ls -ap); do
    relpath=${package#"$prefix"}
    echo '  '"$comma"'{ "path": "'"$relpath"'" }'
    comma=', '
done
echo '    ]'
echo '}'
