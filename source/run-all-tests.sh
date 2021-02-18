#!/bin/bash

#
# Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License"). You may not use 
# this file except in compliance with the License. A copy of the License is located at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# or in the "license" file accompanying this file. This file is distributed on an "AS IS" 
# BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the 
# License for the specific language governing permissions and limitations under the License.
#

#
# This script runs all tests for the root CDK project, as well as any microservices, Lambda functions, or dependency 
# source code packages. These include unit tests, integration tests, and snapshot tests.
#
# The if/then blocks are for error handling. They will cause the script to stop executing if an error is thrown from the
# node process running the test case(s). Removing them or not using them for additional calls with result in the 
# script continuing to execute despite an error being thrown.

# Save the current working directory
source_dir=$PWD

# Install
npm install

# License checks
./license-report.sh
if [ "$?" = "1" ]; then
	echo "(source/run-all-tests.sh) ERROR: there is likely output above." 1>&2
	exit 1
fi

# Test the CDK project
npm run build
npm run lint
npm run test -- -u
if [ "$?" = "1" ]; then
	echo "(source/run-all-tests.sh) ERROR: there is likely output above." 1>&2
	exit 1
fi

# lambda python tests
chmod +x ./run-lambda-tests.sh
./run-lambda-tests.sh

# Return to the source/ level
cd $source_dir