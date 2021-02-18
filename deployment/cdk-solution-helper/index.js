
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

 // Imports
const fs = require("fs");

// Paths
var global_s3_assets = "../global-s3-assets";

if (process.argv[2]) {
  processTemplate(process.argv[2]);
} else {
  // For each template in global_s3_assets ...
  fs.readdirSync(global_s3_assets).forEach((file) => {
    processTemplate(`${global_s3_assets}/${file}`);
  });
}

function processTemplate(file) {
  // Import and parse template file
  const raw_template = fs.readFileSync(`${global_s3_assets}/${file}`);
  let template = JSON.parse(raw_template);

  delete template.Parameters["BootstrapVersion"];
  delete template.Rules;
  iterate("", null, "", template);

  // Output modified template file
  const output_template = JSON.stringify(
    template,
    (k, v) => (k !== "__parent" ? v : undefined),
    2
  );
  fs.writeFileSync(`${global_s3_assets}/${file}`, output_template);
}

function iterate(path, parent, propNameOrIndex, obj) {
  if (typeof obj === "object" && (propNameOrIndex + "").indexOf("__") !== 0) {
    obj.__parent = parent;
    if (obj.constructor.name === "Array")
      obj.forEach((el, i) => iterate(`${path}[${i}]`, obj, i, el));
    else for (var p in obj) iterate(`${path}.${p}`, obj, p, obj[p]);
  } else {
    if (typeof obj === "string") {
      // look for all CDK hardcoded stuff
      if (obj.indexOf("hnb659fds") !== -1) {
        // PolicyDocuments
        if (path.indexOf("PolicyDocument") !== -1) {
          if (
            path.indexOf(
              "PolicyDocument.Statement[2].Resource.Fn::ImportValue"
            ) !== -1
          ) {
            // remove the statement
            parent.__parent.__parent.splice(2, 1);
          } else if (propNameOrIndex === "Fn::Sub") {
            // s3 permissions
            parent[propNameOrIndex] = "%%BUCKET_NAME%%-${AWS::Region}";
          }
          // unknown
          else {
            console.log("unexpected cdk resource", path, obj);
            throw new Error("unexpected cdk stuff found");
          }
        }
        // LaunchConfigurations
        else if (path.indexOf("UserData.Fn::Base64") !== -1) {
          parent[propNameOrIndex] = "%%BUCKET_NAME%%-${AWS::Region}";
          const i = parent.__parent.indexOf(parent);
          parent.__parent[i + 1] =
            "/%%SOLUTION_NAME%%/%%VERSION%%/asset" +
            parent.__parent[i + 1].substr(1);
        }
        // Lambdas
        else if (path.indexOf("Properties.Code.S3Bucket")) {
          if (parent.__parent.S3Key) {
            const s3Key = parent.__parent.S3Key;
            const artifactHash = s3Key.substring(0, s3Key.indexOf("."));
            const assetPath = `asset${artifactHash}`;
            parent.__parent.S3Key = `%%SOLUTION_NAME%%/%%VERSION%%/${assetPath}.zip`;
            parent.__parent.S3Bucket = {
              "Fn::Sub": "%%BUCKET_NAME%%-${AWS::Region}"
            };
          }
        }
        // Unknown
        else {
          console.log("unexpected cdk resource", path, obj);
          throw new Error("unknown cdk stuff found");
        }
      }
    }
  }
}
