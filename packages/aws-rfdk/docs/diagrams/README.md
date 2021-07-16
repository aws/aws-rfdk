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

## Diagram Style Conventions

Please make a best-effort to match the design language of the architecture diagrams. Some details include:

### General

*   10pt Helvetica font
*   Orthogonal (horizontal and vertical only) routing of lines with no curves

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
