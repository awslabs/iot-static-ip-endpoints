/**
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
export function assertResourceWithIdLikeHasCondition(template: any, idlike: RegExp, conditionId: string): void {
  if (typeof template === "object") {
    for (const id in template.Resources) {
      const res = template.Resources[id]
      if (idlike.test(id)) {
        if (res.Condition !== conditionId) {
          throw new Error(`${id} Resource Missing Condition ${conditionId}`)
        }
      }
    }
  }
}
