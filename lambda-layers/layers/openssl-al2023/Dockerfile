FROM public.ecr.aws/amazonlinux/amazonlinux:2023

RUN dnf install -y openssl zip

RUN mkdir -p /tmp/layer

# NOTE: Compatible runtimes should be all Amazon Linux 2023 runtimes per:
# https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
# We are limited to 5 runtimes, as well. So limit to node.
#
# Unlike the previous openssl-al2 layer, we bundle the OpenSSL shared libraries
# (libssl/libcrypto) alongside the binary so the layer does not depend on the
# runtime's system libraries. On the AL2023-based nodejs runtimes the system
# openssl is unusable ("symbol lookup error: SSL_get_srp_g, version OPENSSL_3.0.0"),
# and the runtime's default PATH/LD_LIBRARY_PATH put /usr/bin and /usr/lib64 ahead
# of /opt/bin and /opt/lib. The Lambda handlers therefore prepend the layer's
# directories when spawning openssl -- see opensslProcessEnv() in
# packages/aws-rfdk/lib/lambdas/nodejs/lib/x509-certs/openssl-env.ts.
CMD cd /tmp/layer && \
    mkdir -p bin lib && \
    cp /usr/bin/openssl bin && \
    cp -a /usr/lib64/libssl.so.3* /usr/lib64/libcrypto.so.3* lib/ && \
    zip -r layer.zip ./bin ./lib && \
    rm -rf bin lib && \
    echo "OpenSSL $(openssl version | cut -d ' ' -f 2) for Amazon Linux 2023" > description.txt && \
    echo "OpenSSL ( https://spdx.org/licenses/Apache-2.0.html#licenseText )" > license.txt && \
    echo "nodejs20.x nodejs22.x nodejs24.x" > runtimes.txt
