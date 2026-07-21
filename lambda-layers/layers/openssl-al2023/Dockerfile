FROM public.ecr.aws/amazonlinux/amazonlinux:2023

RUN dnf install -y openssl zip

RUN mkdir -p /tmp/layer

# NOTE: Compatible runtimes should be all Amazon Linux 2023 runtimes per:
# https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html
# We are limited to 5 runtimes, as well. So limit to node.
#
# Unlike the previous openssl-al2 layer, we bundle the OpenSSL shared libraries
# (libssl/libcrypto) alongside the binary. The Lambda runtime environment adds
# /opt/lib to LD_LIBRARY_PATH, so the bundled binary always resolves the exact
# libraries it was built against. Relying on the runtime's system libraries is
# not safe: the AL2-built binary failed on the AL2023-based nodejs22.x runtime
# with "symbol lookup error: SSL_get_srp_g, version OPENSSL_3.0.0".
CMD cd /tmp/layer && \
    mkdir -p bin lib && \
    cp /usr/bin/openssl bin && \
    cp -a /usr/lib64/libssl.so.3* /usr/lib64/libcrypto.so.3* lib/ && \
    zip -r layer.zip ./bin ./lib && \
    rm -rf bin lib && \
    echo "OpenSSL $(openssl version | cut -d ' ' -f 2) for Amazon Linux 2023" > description.txt && \
    echo "OpenSSL ( https://spdx.org/licenses/Apache-2.0.html#licenseText )" > license.txt && \
    echo "nodejs20.x nodejs22.x" > runtimes.txt
