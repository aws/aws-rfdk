/**
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A mongo shell script skeleton to create the admin user, conditionally.
 * It will not create or modify the admin user if it already exists.
 *
 * To use this script:
 * 1) Create a file beside it called 'adminCredentials.js' that contains the
 * definition of a single variable as follows:
 * ---- start
 * var adminCredentials = {
 *   username: <username>,
 *   password: <password>,
 * }
 * ---- end
 * 2) Run the script when mongo is not in authentication mode:
 * mongo --port 27017 --host localhost ./createAdminUser.js --quiet
 */

load('./adminCredentials.js');
if (!adminCredentials || !adminCredentials.username || !adminCredentials.password) {
  throw 'ERROR -- malformed input file: adminCredentials.js'
}

conn = new Mongo();
db = conn.getDB('admin');

adminUser = db.getUser(adminCredentials.username);
if (!adminUser) {
  db.createUser({
    user: adminCredentials.username,
    pwd: adminCredentials.password,
    roles: [ { role: 'userAdminAnyDatabase', db: 'admin' }, 'readWriteAnyDatabase' ],
  });  
} else {
  print('\'' + adminCredentials.username + '\' user already exists. Not modifiying credentials.');
}
