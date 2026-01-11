# Daily Carry Plugin

Essential skills and commands for daily development workflows, with a focus on OtterStack deployments and DevOps automation.

## Commands

### /deploy-otterstack

Automated end-to-end deployment orchestration for OtterStack with preparation, setup, and iterative debugging.

**Usage:**
```bash
/deploy-otterstack [project-name]
```

**Features:**
- Validates Docker Compose compatibility before deployment
- Interactive setup for environment variables
- Choose between local or VPS deployment each time
- Automatic debugging with up to 6 retry attempts
- Zero-downtime deployments via Traefik
- Success verification with health checks

**Workflow:**
1. **Preparation** - Analyzes project for OtterStack readiness
2. **Target Selection** - Prompts for local or VPS deployment
3. **Setup** - Configures project and environment variables
4. **Deployment** - Executes deployment with verbose monitoring
5. **Debug Loop** - Auto-debugs failures iteratively
6. **Verification** - Confirms deployment success

**Examples:**
```bash
# Deploy current directory
/deploy-otterstack

# Deploy specific project
/deploy-otterstack my-api

# With .env file for auto-loading
echo "DATABASE_URL=..." > .env.my-project
/deploy-otterstack my-project
```

**Requirements:**
- Docker Compose project with `docker-compose.yml`
- OtterStack installed (local) or SSH access to VPS
- Git repository with remote URL (for VPS deployments)

## Skills Included

### OtterStack Deployment Suite

#### prepare-otterstack-deployment

Analyzes codebases for OtterStack deployment readiness. Validates Docker Compose compatibility, scans for environment variables, and detects common failure patterns.

**Triggers when you ask about:**
- "Prepare for OtterStack"
- "Validate compose file"
- "Check deployment readiness"
- "Scan env vars"

**What it checks:**
- 5 critical OtterStack requirements (no container_name, environment section usage, etc.)
- 5 common failure patterns (native modules, permissions, migrations, IPv6/IPv4 conflicts, build context)
- Environment variable discovery for Node.js, Python, Ruby, and Go

**Output:** Structured readiness report with compatibility checks, issues found, and recommended fixes

#### otterstack-usage

Complete reference guide for using OtterStack - a Git-driven Docker Compose deployment tool with zero-downtime deployments.

**Triggers when you ask about:**
- "How to use OtterStack"
- "OtterStack commands"
- "Deploy with OtterStack"
- "OtterStack project" or "OtterStack env"

**Covers:**
- Project management (`project add`, `project list`, `project remove`)
- Environment variables (`env set`, `env scan`, `env list`, `env load`)
- Deployment commands (`deploy`, `status`, `deployments`)
- Smart type detection for variables (URLs, emails, ports, booleans)
- Zero-downtime deployments with Traefik
- Troubleshooting common issues

#### debug-vps-deployment

Deploys to VPS (archivist@194.163.189.144) and iteratively debugs deployment failures until successful.

**Triggers when you ask about:**
- "Deploy to VPS"
- "Debug deployment"
- "Fix container failure"

**What it does:**
- SSH-based deployment to specific VPS
- Iterative debugging with decision tree for 5 failure types:
  1. Compose validation failures
  2. Service startup failures
  3. Health check failures
  4. Deployment lock conflicts
  5. Traefik routing issues
- Real example included: 6-iteration Aperture deployment
- Success verification checklist

### Portainer

Manage Docker stack deployments via Portainer API. Create stacks from Git repos, check deployment status, redeploy, and view logs.

**Triggers when you ask about:**
- Deploying to Portainer
- Checking stack status
- Managing Docker deployments

**Requirements:**
- `PORTAINER_URL` - Your Portainer instance URL
- `PORTAINER_TOKEN` - API token from Portainer

### Tech Research Enforcer

Enforces iterative web research for coding and DevOps questions to prevent assumptions about libraries, frameworks, APIs, and configurations.

**Triggers when you ask about:**
- Programming languages, frameworks, libraries
- DevOps tools, cloud platforms, databases
- Configuration files, API syntax, CLI commands
- Any technical topic where current documentation matters

## Installation

```bash
/plugin marketplace add YOUR_USERNAME/agent-skills
/plugin install daily-carry
```

## Usage

Once installed, these skills activate automatically based on conversation context. No slash commands needed.

## License

MIT
