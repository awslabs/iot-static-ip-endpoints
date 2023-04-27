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


import boto3
from botocore.stub import Stubber
from CreateDeviceVpnCertificate import handler
from botomock import new_mock_context
import unittest


class TestSuite(unittest.TestCase):
    def test_it_generates_private_key_without_csr(self):
        with new_mock_context():
            res = handler({"ClientName": "MyThing"}, None)
            self.assertGreater(len(res), 1000, "private key pem length ok length")

    def test_it_generates_with_csr(self):
        with new_mock_context():
            res = handler({"ClientName": "MyThing", "CSR": "mock"}, None)
            self.assertEqual(res, "REPLACE_WITH_PRIVATE_KEY_PEM")

    def test_it_fails_with_missing_thing_name(self):
        with new_mock_context():
            try:
                res = handler({}, None)
            except Exception as e:
                pass

    def test_it_fails_with_empty_thing_name(self):
        try:
            res = handler({"ClientName": ""}, None)
        except AssertionError as e:
            pass
        except Exception as e:
            raise e

    def test_it_fails_with_long_thing_name(self):
        try:
            res = handler(
                {
                    "ClientName": "jjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj"
                },
                None,
            )
        except AssertionError as e:
            pass
        except Exception as e:
            raise e


if __name__ == "__main__":
    unittest.main()