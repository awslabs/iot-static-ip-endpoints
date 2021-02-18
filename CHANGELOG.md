# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2021-02-01

### Added

- Stands up an OpenVPN cluster behind a Network Load Balancer
- Adds Lambda functions for creating and revoking certificates
- Adds a CloudWatch dashboard for monitoring
- Configures CPU based scaling for the cluster
- Adds an EFS share for the cluster to share OpenVPN configurations
- Configures log groups in CloudWatch logs
