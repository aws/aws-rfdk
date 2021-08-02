RFDK Architecture Diagrams
==========================

RFDK uses https://app.diagrams.net for our diagrams. We use the `.svg` file format and embed the draw.io diagram inside.

## Directory Structure
The following directory structure convention is used to place the architecture diagrams:

    packages/aws-rfdk/docs/diagrams/<package>/<ConstructName>.svg

Or visually speaking:

```
aws-rfdk/
└── packages
    └── aws-rfdk
        └── docs
            └── diagrams
                ├── core
                │   ├── <ConstructName>.svg
                │   └── ...
                ├── deadline
                │   ├── <ConstructName>.svg
                │   └── ...
                └── <additional_package>
                    ├── <ConstructName>.svg
                    └── ...
```

## Referencing the Architecture Diagrams in Code

Architecture diagrams should be embedded in construct JSDoc strings. They can be expressed using Markdown image syntax:

```md
![architecture diagram](/diagrams/<package>/<ConstructName>.svg)
```

where the URL is an absolute POSIX path rooted from `aws-rfdk/packages/aws-rfdk/docs`. The RFDK API reference docs
only process image URLs that begin with `/diagrams`. Putting this together, the JSDoc header for construct `MyConstruct`
in the `core` package would look:

```ts
import { Construct } from '@aws-cdk/core';

/**
 * Documentation for MyConstruct
 *
 * ![architecture diagram](/diagrams/core/MyConstruct.svg)
 */
export class MyConstruct extends Construct {
  // ...
}
```

## Diagram Style Conventions

Please make a best-effort to match the design language of the architecture diagrams. Some details include:

### General

*   10pt Helvetica font
*   Orthogonal (horizontal and vertical only) routing of lines with no curves
*   For connecting lines that overlap other lines of the same color, use the **Arc** for the **Line jumps** line
    property 

### Constructs


#### Primary Construct Overlay

For per-construct architecture diagrams, the resources deployed by the primary construct being documented should have an
overlay rectangle with the following properties:

| Property              | Value                         |
| --------------------- | ----------------------------- |
| **Fill color**        | 0E7017                        |
| **Fill opacity**      | 8                             |
| **Font color**        | 0A5211                        |
| **Font**              | Helvetica, 16pt               |
| **Text Alignment**    | Top Center / Bottom Center    |

It should be brought to the top of the layers. See the `SpotEventPluginFleet` diagram for an example:

![SpotEventPluginFleet architecture diagram](./deadline/SpotEventPluginFleet.svg)

### Interfaces

In a construct architecture diagram, illustrate the interfaces between other RFDK constructs. For these related
constructs, only resources that participate in the interface need to be included in the diagram. For example, see the
following architecture diagram for the `RenderQueue`:

![RenderQueue architecture diagram](./deadline/RenderQueue.svg)

### Resources and Services

When a CloudFormation resource is present in a diagram, its corresponding service should have its own icon in the
diagram with a connnecting line between the service and the resource. These services and resources are color-coded
as provided by the **AWS19** draw.io icon library. The color of the font and line connecting the service to the resource
should match the service/resource fill color to help visually connect and group the resources and services.
