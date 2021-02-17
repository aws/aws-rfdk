# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from dataclasses import dataclass
import re

VALID_NAMES = re.compile(r"^[a-z][a-z0-9_]+$")

# Properties for invoking the template function
@dataclass
class TemplateProps():
    """
    Properties for an Image Builder component template
    """
    # Path to the template file.
    template_path: str

    # Mapping of token names to their substituted values.
    # Valid tokens are of the form `/^[a-z][a-z0-9_]+$/i`. Such as:
    # ```
    # ${NAME}
    # ```
    tokens: dict

# Simple templating function. Loads a template from a path and substitutes all
# occurrences of the tokens with their values. Tokens are of the form
def template_component(props: TemplateProps) -> str:
    if not props.template_path.endswith('.component.template'):
        raise Exception(f"Path does not end with \".component.template\": {props.template_path}")

    # Validate the tokens
    for name in props.tokens.keys():
        if VALID_NAMES.search(name) is None:
            raise Exception(f"Invalid token name {name}")

    f = open(props.template_path, "r")
    result = f.read()
    f.close()

    # Replace the tokens
    for name in props.tokens.keys():
        result = result.replace(f"${{{name}}}", props.tokens[name])

    return result
