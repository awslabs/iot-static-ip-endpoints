/**
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"). You may not use
 * this file except in compliance with the License. A copy of the License is located at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under the License.
 **/

import * as lambda from "aws-cdk-lib/aws-lambda"

export const PYTHON_LAMBDA_RUNTIME: lambda.Runtime = lambda.Runtime.PYTHON_3_8
export const SOLUTION_ID = process.env.SOLUTION_ID || "%%SOLUTION_ID%%"
export const VERSION = process.env.SOLUTION_VERSION || "%%SOLUTION_VERSION%%"
export const SOLUTION_DISPLAY_NAME = process.env.SOLUTION_NAME || "%%SOLUTION_DISPLAY_NAME%%"
export const SOLUTION_NAME = process.env.SOLUTION_TRADEMARKEDNAME || "%%SOLUTION_NAME%%"
