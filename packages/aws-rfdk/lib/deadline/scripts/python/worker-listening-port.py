# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

import argparse
import Deadline

worker_name = None
listening_port = None

def __main__(*args):
    parser = argparse.ArgumentParser(description="Configures the listening port for a deadline worker")
    parser.add_argument(
        '-n',
        dest="worker_name",
        required=True,
        type=str,
        help="The worker's name"
    )
    parser.add_argument(
        '-p',
        dest="listening_port",
        required=True,
        type=int,
        help="The port to configure for listening on"
    )
    args = parser.parse_args(args)

    try:
        worker_settings = Deadline.Scripting.RepositoryUtils.GetSlaveSettings(args.worker_name, True)
    except:
        raise Exception("Failed to get settings for worker: {}".format(args.worker_name))

    worker_settings.SlaveListeningPort = args.listening_port
    worker_settings.SlaveOverrideListeningPort = True

    try:
        Deadline.Scripting.RepositoryUtils.SaveSlaveSettings(worker_settings)
    except:
        raise Exception("Failing to save settings for {}".format(args.worker_name))

    print("Successfully set {} to listen on port {}".format(args.worker_name, args.listening_port))
