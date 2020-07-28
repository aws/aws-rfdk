#!/bin/bash

dir=$PWD
filename=$(npm pack)

echo "Copying $filename to $dir/../dist/js"
cp "$filename" "$dir/../../dist/js/"