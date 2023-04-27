#!/bin/bash

#
# Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

cd assets/lambda || exit

# we need the crypto module
python3 -m pip install cryptography -t . --upgrade
python3 -m pip install coverage -t . --upgrade

# check all the files will at least compile without syntax errors
for file in *.py; do
    [[ "$file" == "six.py" ]] && continue
    echo "Validating $file"
	UNIT_TESTING=Yes \
    REGION=us-west-2 \
    STACK_NAME=unit-testing \
    AUTO_SCALING_GROUP_NAME=my_asg \
    SOLUTION_ID=S0139 \
    PERIOD_SECONDS=5 \
    SEND_USAGE_DATA=Yes \
    python3 $file
done

cd ../../test-lambda || exit
python3 -m pip install mock

# run all our tests
rm -rf .coverage
export PYTHONPATH="../assets/lambda"
for file in *.test.py; do
    [[ "$file" == "six.py" ]] && continue
    echo "Executing test $file"
	UNIT_TESTING=Yes \
    REGION=us-west-2 \
    STACK_NAME=unit-testing \
    AUTO_SCALING_GROUP_NAME=my_asg \
    SOLUTION_ID=S0139 \
    PERIOD_SECONDS=5 \
    SEND_USAGE_DATA=Yes \
    python3 -m coverage run -a \
    --source=../assets/lambda \
    --omit=*/cffi*,*/cryptography*,*/coverage/*,*/pycparser/*,*/six.py \
    $file
done

python3 -m coverage html

