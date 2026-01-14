# Changelog

All notable changes to the daily-carry plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## Version 1.2.0 - 2026-01-14

### Added
- Network detection in prepare-otterstack-deployment skill
  - Automatically scans docker-compose.yml for network definitions
  - Identifies default network and service attachments
  - Adds NETWORK_NAME as environment variable
- Traefik exposure detection and configuration
  - Scans for Traefik-enabled services in compose file
  - Interactive domain collection for exposed services
  - Automatic generation of comprehensive Traefik labels
- CrowdSec security integration
  - CrowdSec bouncer middleware configuration
  - API key management for DDoS protection
  - Integrated with Traefik routing for all exposed services
- Phase 4.5 in deploy-otterstack command for Traefik label generation
  - Template-based label generation with domain variables
  - TLS/HTTPS configuration with Let's Encrypt
  - Load balancer port configuration
  - CrowdSec middleware labels

### Changed
- Enhanced prepare-otterstack-deployment skill with network analysis
- Enhanced deploy-otterstack command workflow with 8 phases (added Phase 4.5)
- Updated Phase 2 to parse network and Traefik exposure data
- Updated Phase 3 with Traefik exposure configuration prompts
- Updated Phase 4 to set network, domain, and security variables
- Expanded critical OtterStack requirements from 5 to 6 (added network configuration)

## Version 1.0.0 - 2026-01-12

### Added
- Initial release of daily-carry plugin
- deploy-otterstack command for Netlify deployment workflow
- 7-phase orchestration pattern with user confirmation points
