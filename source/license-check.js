/** 
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use 
 * this file except in compliance with the License. A copy of the License is located at
 *
 *     http://aws.amazon.com/apache2.0/
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS" 
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the 
 * License for the specific language governing permissions and limitations under the License.
 **/

const process = require("process")
const licenses = require("./licenses.json")
const { synthesizeBlockDeviceMappings } = require("@aws-cdk/aws-ec2")
var results = {}

var blessed = [
  "Apache-2.0",
  "Apache 2.0",
  "MIT",
  "(MIT OR CC0-1.0)",
  "MIT*",
  "(MIT OR GPL-3.0-or-later)",
  "(MIT OR Apache-2.0)",
  "0BSD",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "AFLv2.1,BSD",
  "(BSD-2-Clause OR MIT OR Apache-2.0)",
  "ISC",
  "ISC*",
  "PSF",
  "CC0-1.0",
  "Unlicense",
  "CC-BY-3.0"
]

var exceptions = [
  "cli-color@0.1.7", // GitHub lists this at MIT - https://github.com/aws/aws-cdk/issues/4517
  "dreamopt@0.6.0" // MIT: https://github.com/andreyvit/dreamopt.js/blob/master/LICENSE
]

for (var pkg in licenses) {
  var obj = licenses[pkg]
  var license = obj["licenses"]
  if (license.constructor.name === "Array") license = license.join(",")
  if (blessed.indexOf(license) === -1 && exceptions.indexOf(pkg) === -1) {
    if (!results[license]) {
      results[license] = []
    }
    if (results[license].indexOf(pkg) === -1) {
      results[license].push(pkg)
    }
  }
}

var numFound = Object.keys(results).length
if (numFound !== 0) {
  console.log("Unblessed licenses found")
  console.log(JSON.stringify(results, null, 2))
  process.exit(-1)
} else {
  console.log("Licenses ok")
}
