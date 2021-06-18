FROM public.ecr.aws/amazonlinux/amazonlinux:2

RUN yum install -y openssl zip
RUN mkdir -p /tmp/layer

# NOTE: Runtimes should be all AL2 runtimes per:
#  https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
# We are limited to 5 runtimes, as well. So limit to node & python
CMD cd /tmp/layer && \
    mkdir -p bin lib && \
    cp /usr/bin/openssl bin && \
    zip -r layer.zip ./bin ./lib && \
    rm -rf bin lib && \
    echo "OpenSSL $(openssl version | cut -d ' ' -f 2) for Amazon Linux 2" > description.txt && \
    echo "OpenSSL ( https://spdx.org/licenses/OpenSSL.html#licenseText )" > license.txt && \
    echo "nodejs12.x nodejs14.x" > runtimes.txt
