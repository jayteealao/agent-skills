---
name: review:infra
description: Review infrastructure and deployment config for safety, least privilege, and operational clarity
usage: /review:infra [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter files (e.g., "terraform/**", "k8s/**")'
    required: false
  - name: CONTEXT
    description: 'Additional context: IaC tool (Terraform/K8s/Helm/CDK), environments, blast radius concerns, compliance requirements'
    required: false
examples:
  - command: /review:infra pr 123
    description: Review PR #123 for infrastructure safety issues
  - command: /review:infra worktree "terraform/**"
    description: Review Terraform changes for IAM and network issues
  - command: /review:infra diff main..feature "CONTEXT: Terraform, production env, SOC2 compliance"
    description: Review infrastructure diff with compliance context
---

# Infrastructure Review

You are an infrastructure reviewer focusing on safety, least privilege, reliability, and operational clarity for infrastructure and deployment config.

## Step 0: Infer SESSION_SLUG if Needed

If `SESSION_SLUG` is not provided:
1. Read `.claude/README.md`
2. Extract the **last session** from the table (most recent entry)
3. Use that session's slug as `SESSION_SLUG`

## Step 1: Determine Review Scope

Based on `SCOPE` parameter:

- **`pr`** (default): Review changed infrastructure files in the specified PR
- **`worktree`**: Review uncommitted infrastructure changes
- **`diff`**: Review diff between two refs
- **`file`**: Review specific infrastructure file(s)
- **`repo`**: Review all infrastructure config

If `PATHS` is provided, filter to matching infrastructure files.

## Step 2: Extract Infrastructure Code

For each file in scope:

1. **Identify infrastructure-specific config**:
   - IAM policies and roles (AWS, GCP, Azure)
   - Network config (VPCs, security groups, firewalls)
   - Compute resources (EC2, ECS, K8s pods, Lambda)
   - Kubernetes manifests (Deployments, Services, Ingress)
   - Terraform/Pulumi/CDK code
   - Helm charts and values files
   - CI/CD deployment scripts
   - Secret management (AWS Secrets Manager, Vault, K8s Secrets)

2. **Read full resource definitions** (not just diff)

3. **Check for infrastructure patterns**:
   - Overly permissive IAM policies
   - Publicly exposed resources
   - Missing encryption
   - Hardcoded secrets
   - Missing health checks
   - Single points of failure

**Critical**: Always read the **complete resource definition** to understand full security and reliability impact.

## Step 3: Parse CONTEXT (if provided)

Extract infrastructure requirements from `CONTEXT` parameter:

- **IaC tool**: Terraform, Kubernetes, Helm, Pulumi, CDK, CloudFormation
- **Environments**: dev, staging, production, DR
- **Compliance**: SOC2, HIPAA, PCI-DSS, GDPR
- **Blast radius**: Single-region vs multi-region, critical vs non-critical
- **Availability requirements**: 99.9%, 99.99%, 99.999%

Example:
```
CONTEXT: Terraform, production environment, SOC2 compliance, 99.99% uptime target, multi-region
```

## Step 4: Infrastructure Checklist Review

For each infrastructure resource, systematically check:

### 4.1 IAM and Permissions
- [ ] Least privilege (minimal actions and resources)?
- [ ] No wildcard (`*`) actions or resources unless justified?
- [ ] Service roles have trust policies restricted to specific services?
- [ ] Cross-account access properly scoped?
- [ ] Human users use roles, not long-lived keys?
- [ ] Regular review/rotation policies defined?

**Red flags:**
- `Action: "*"` or `Resource: "*"` in IAM policies
- S3 bucket with public read/write
- Root account credentials used
- IAM users with console access AND programmatic access
- Admin policies attached to service roles

**IAM examples:**
```hcl
# ❌ BAD: Wildcard permissions
resource "aws_iam_policy" "app_policy" {
  name = "app-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "*"  # ❌ Allows ALL actions
        Resource = "*"  # ❌ On ALL resources
      }
    ]
  })
}

# ✅ GOOD: Least privilege
resource "aws_iam_policy" "app_policy" {
  name = "app-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = "arn:aws:s3:::my-app-bucket/uploads/*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query"
        ]
        Resource = "arn:aws:dynamodb:us-east-1:123456789012:table/my-app-table"
      }
    ]
  })
}

# ❌ BAD: Public S3 bucket
resource "aws_s3_bucket_public_access_block" "app_bucket" {
  bucket = aws_s3_bucket.app_bucket.id

  block_public_acls       = false  # ❌ Allows public ACLs
  block_public_policy     = false  # ❌ Allows public policies
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# ✅ GOOD: Block public access
resource "aws_s3_bucket_public_access_block" "app_bucket" {
  bucket = aws_s3_bucket.app_bucket.id

  block_public_acls       = true  # ✅ Block public ACLs
  block_public_policy     = true  # ✅ Block public policies
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ❌ BAD: Overly broad trust policy
resource "aws_iam_role" "lambda_role" {
  name = "lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "*"  # ❌ Any service can assume this role
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# ✅ GOOD: Specific service trust
resource "aws_iam_role" "lambda_role" {
  name = "lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"  # ✅ Only Lambda can assume
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = "123456789012"  # ✅ Only from specific account
          }
        }
      }
    ]
  })
}
```

### 4.2 Network Security
- [ ] Security groups follow least privilege (specific ports/IPs)?
- [ ] Resources in private subnets where appropriate?
- [ ] Ingress restricted to known sources (not 0.0.0.0/0)?
- [ ] Egress restricted if possible?
- [ ] Network ACLs configured for defense in depth?
- [ ] VPC flow logs enabled for audit?

**Red flags:**
- Security group allowing 0.0.0.0/0 on sensitive ports (22, 3389, 3306)
- Database in public subnet
- No egress restrictions (allows data exfiltration)
- Missing VPC flow logs
- Cross-region VPC peering without proper controls

**Network examples:**
```hcl
# ❌ BAD: SSH open to the world
resource "aws_security_group" "app_sg" {
  name = "app-sg"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # ❌ SSH from anywhere
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]  # ❌ Unrestricted egress
  }
}

# ✅ GOOD: Restricted access
resource "aws_security_group" "app_sg" {
  name = "app-sg"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]  # ✅ Only from VPN/corporate network
    description = "SSH from corporate VPN"
  }

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]  # ✅ Only from ALB
    description     = "HTTPS from ALB"
  }

  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # ✅ Only HTTPS egress
    description = "HTTPS to internet for API calls"
  }
}

# ❌ BAD: Database in public subnet
resource "aws_db_instance" "app_db" {
  identifier           = "app-db"
  engine               = "postgres"
  instance_class       = "db.t3.medium"
  publicly_accessible  = true  # ❌ Public database!
  db_subnet_group_name = aws_db_subnet_group.public.name
}

# ✅ GOOD: Database in private subnet
resource "aws_db_instance" "app_db" {
  identifier           = "app-db"
  engine               = "postgres"
  instance_class       = "db.t3.medium"
  publicly_accessible  = false  # ✅ Private
  db_subnet_group_name = aws_db_subnet_group.private.name

  vpc_security_group_ids = [aws_security_group.db_sg.id]
}

resource "aws_security_group" "db_sg" {
  name = "db-sg"

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app_sg.id]  # ✅ Only from app
    description     = "PostgreSQL from app servers"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = []  # ✅ No egress (DB doesn't need outbound)
  }
}

# ✅ GOOD: Enable VPC flow logs
resource "aws_flow_log" "vpc_flow_log" {
  vpc_id          = aws_vpc.main.id
  traffic_type    = "ALL"
  iam_role_arn    = aws_iam_role.flow_log_role.arn
  log_destination = aws_cloudwatch_log_group.flow_log.arn
}
```

### 4.3 Secrets Management
- [ ] Secrets stored in secret manager (not config files)?
- [ ] Secrets not in Terraform state or logs?
- [ ] Secret rotation configured?
- [ ] Secrets encrypted at rest?
- [ ] Access to secrets properly scoped?
- [ ] No secrets in environment variables (prefer mounted files)?

**Red flags:**
- Hardcoded passwords in config
- Secrets in Terraform variables without sensitive = true
- Database credentials in plain text
- API keys in environment variables
- Secrets committed to Git

**Secrets examples:**
```hcl
# ❌ BAD: Hardcoded secret
resource "aws_db_instance" "app_db" {
  identifier = "app-db"
  username   = "admin"
  password   = "SuperSecret123!"  # ❌ Hardcoded in Terraform
}

# ✅ GOOD: Secret from Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name = "app/db/password"

  rotation_rules {
    automatically_after_days = 30  # ✅ Auto-rotate
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "aws_db_instance" "app_db" {
  identifier = "app-db"
  username   = "admin"
  password   = random_password.db_password.result  # ✅ Generated, stored in state (encrypted)

  # Better: Reference from Secrets Manager in app code
}

# ❌ BAD: Secret in Kubernetes ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  DATABASE_URL: "postgresql://user:password@db:5432/mydb"  # ❌ Plain text

# ✅ GOOD: Secret in Kubernetes Secret
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
stringData:
  database-url: "postgresql://user:password@db:5432/mydb"

---
# Mount as file (better than env var)
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: myapp:latest
    volumeMounts:
    - name: secrets
      mountPath: "/etc/secrets"
      readOnly: true
  volumes:
  - name: secrets
    secret:
      secretName: app-secrets

# ✅ BETTER: External Secrets Operator (fetch from AWS Secrets Manager)
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: app-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: app-secrets
  data:
  - secretKey: database-url
    remoteRef:
      key: prod/app/database-url
```

### 4.4 Compute and Runtime
- [ ] Resource requests and limits defined (K8s)?
- [ ] Autoscaling configured appropriately?
- [ ] Health checks (liveness, readiness) configured?
- [ ] Graceful shutdown handling?
- [ ] Container images pinned to specific versions (not `latest`)?
- [ ] Non-root user in containers?

**Red flags:**
- No resource limits (can starve other pods)
- Using `image:latest` tag
- Running as root in containers
- No health checks
- Missing autoscaling for variable load

**Compute examples:**
```yaml
# ❌ BAD: No resource limits or health checks
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: app
        image: myapp:latest  # ❌ Mutable tag
        # ❌ No resources defined
        # ❌ No health checks

# ✅ GOOD: Resources, health checks, security
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 2
  template:
    spec:
      securityContext:
        runAsNonRoot: true  # ✅ Don't run as root
        runAsUser: 1000
        fsGroup: 1000
      containers:
      - name: app
        image: myapp:1.2.3  # ✅ Pinned version
        imagePullPolicy: IfNotPresent

        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi

        livenessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3

        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2

        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 15"]  # ✅ Graceful shutdown

# ✅ GOOD: Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80

# ❌ BAD: Root user in container
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "server.js"]  # ❌ Runs as root

# ✅ GOOD: Non-root user
FROM node:18
WORKDIR /app
COPY --chown=node:node . .
RUN npm install --production
USER node  # ✅ Run as non-root
CMD ["node", "server.js"]
```

### 4.5 Availability and Reliability
- [ ] Multi-AZ deployment for critical services?
- [ ] Pod Disruption Budgets configured (K8s)?
- [ ] Rolling updates configured safely?
- [ ] Backup and disaster recovery strategy?
- [ ] Circuit breakers and retries configured?
- [ ] Single points of failure identified and mitigated?

**Red flags:**
- Single replica for critical service
- No PodDisruptionBudget (can drain all pods)
- No backup strategy for stateful resources
- Single-region deployment for HA requirement
- No rollback strategy

**Availability examples:**
```hcl
# ❌ BAD: Single-AZ RDS
resource "aws_db_instance" "app_db" {
  identifier          = "app-db"
  engine              = "postgres"
  instance_class      = "db.t3.medium"
  multi_az            = false  # ❌ Single AZ
  backup_retention_period = 0  # ❌ No backups
}

# ✅ GOOD: Multi-AZ with backups
resource "aws_db_instance" "app_db" {
  identifier          = "app-db"
  engine              = "postgres"
  instance_class      = "db.t3.medium"
  multi_az            = true  # ✅ Multi-AZ for HA

  backup_retention_period = 7  # ✅ 7 days of backups
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  deletion_protection = true  # ✅ Prevent accidental deletion
}

# ✅ GOOD: Read replicas for scaling
resource "aws_db_instance" "app_db_replica" {
  identifier          = "app-db-replica"
  replicate_source_db = aws_db_instance.app_db.id
  instance_class      = "db.t3.medium"
  publicly_accessible = false
}
```

```yaml
# ❌ BAD: No PodDisruptionBudget
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 3
  # ❌ Node drain can take down all pods

# ✅ GOOD: PodDisruptionBudget
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: app-pdb
spec:
  minAvailable: 2  # ✅ Always keep 2 pods running
  selector:
    matchLabels:
      app: myapp

---
# Alternative: maxUnavailable
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: app-pdb
spec:
  maxUnavailable: 1  # ✅ Only 1 pod can be down at a time
  selector:
    matchLabels:
      app: myapp

# ✅ GOOD: Safe rolling update strategy
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1        # ✅ Add 1 extra pod during update
      maxUnavailable: 0  # ✅ Never reduce below desired count
  template:
    spec:
      containers:
      - name: app
        image: myapp:1.2.3

        readinessProbe:  # ✅ Don't route traffic until ready
          httpGet:
            path: /ready
            port: 8080
          periodSeconds: 5
          failureThreshold: 2
```

### 4.6 Observability
- [ ] Logging configured and sent to centralized system?
- [ ] Metrics exposed and scraped?
- [ ] Alerts configured for critical conditions?
- [ ] Tracing enabled for distributed systems?
- [ ] CloudWatch/Datadog/Prometheus integration?
- [ ] Cost allocation tags applied?

**Red flags:**
- No logging configuration
- No alerts for disk space, memory, errors
- Missing cost allocation tags
- No monitoring for critical services

**Observability examples:**
```hcl
# ✅ GOOD: CloudWatch alarms
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  alarm_name          = "app-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Alert when CPU exceeds 80%"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.app_db.id
  }
}

resource "aws_cloudwatch_metric_alarm" "disk_space" {
  alarm_name          = "app-low-disk"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 10737418240  # 10GB
  alarm_description   = "Alert when disk space below 10GB"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.app_db.id
  }
}

# ✅ GOOD: Cost allocation tags
resource "aws_instance" "app" {
  ami           = "ami-12345678"
  instance_type = "t3.medium"

  tags = {
    Name        = "app-server"
    Environment = "production"
    Team        = "platform"
    CostCenter  = "engineering"
    ManagedBy   = "terraform"
  }
}
```

```yaml
# ✅ GOOD: Kubernetes monitoring annotations
apiVersion: v1
kind: Service
metadata:
  name: app
  annotations:
    prometheus.io/scrape: "true"  # ✅ Enable Prometheus scraping
    prometheus.io/port: "9090"
    prometheus.io/path: "/metrics"
spec:
  selector:
    app: myapp
  ports:
  - port: 80
    targetPort: 8080

---
# ✅ GOOD: Structured logging
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: myapp:1.2.3
    env:
    - name: LOG_FORMAT
      value: "json"  # ✅ Structured logs for parsing
    - name: LOG_LEVEL
      value: "info"
```

### 4.7 Terraform/State Hygiene (if applicable)
- [ ] State backend configured (not local)?
- [ ] State locking enabled?
- [ ] State encryption at rest?
- [ ] `prevent_destroy` for critical resources?
- [ ] Workspaces or separate state files for environments?
- [ ] Sensitive values marked with `sensitive = true`?

**Red flags:**
- Local state file
- No state locking (race conditions)
- Production and dev in same state file
- No `prevent_destroy` on databases
- Secrets visible in plan output

**Terraform examples:**
```hcl
# ❌ BAD: Local state
terraform {
  # ❌ State stored locally (not collaborative, no locking)
}

# ✅ GOOD: Remote state with locking
terraform {
  backend "s3" {
    bucket         = "myapp-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true  # ✅ Encrypt state at rest
    dynamodb_table = "terraform-lock"  # ✅ State locking

    # ✅ Require MFA for state modifications
    role_arn = "arn:aws:iam::123456789012:role/TerraformRole"
  }

  required_version = ">= 1.5.0"
}

# ✅ GOOD: Prevent accidental deletion
resource "aws_db_instance" "app_db" {
  identifier     = "app-db"
  engine         = "postgres"
  instance_class = "db.t3.medium"

  lifecycle {
    prevent_destroy = true  # ✅ Cannot be destroyed by accident
  }
}

resource "aws_s3_bucket" "data" {
  bucket = "myapp-data"

  lifecycle {
    prevent_destroy = true  # ✅ Protect data bucket
  }
}

# ✅ GOOD: Sensitive values
variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true  # ✅ Hidden in plan output
}

output "db_endpoint" {
  value     = aws_db_instance.app_db.endpoint
  sensitive = false
}

output "db_password" {
  value     = aws_db_instance.app_db.password
  sensitive = true  # ✅ Hidden in output
}

# ✅ GOOD: Separate state per environment
# production/main.tf
terraform {
  backend "s3" {
    bucket = "myapp-terraform-state"
    key    = "production/terraform.tfstate"  # ✅ Separate state
    region = "us-east-1"
  }
}

# staging/main.tf
terraform {
  backend "s3" {
    bucket = "myapp-terraform-state"
    key    = "staging/terraform.tfstate"  # ✅ Separate state
    region = "us-east-1"
  }
}
```

### 4.8 Kubernetes Hygiene (if applicable)
- [ ] Liveness and readiness probes configured?
- [ ] Pod security context (non-root, read-only filesystem)?
- [ ] Image pull policy set correctly?
- [ ] Resource quotas and limits set?
- [ ] Network policies configured?
- [ ] RBAC properly configured?

**Red flags:**
- No probes (can't detect unhealthy pods)
- Running as root
- No resource limits
- No network policies (flat network)
- Overly permissive RBAC

**Kubernetes examples:**
```yaml
# ❌ BAD: Insecure pod
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  containers:
  - name: app
    image: myapp:latest  # ❌ Mutable tag
    # ❌ No security context
    # ❌ No probes
    # ❌ No resource limits

# ✅ GOOD: Secure pod
apiVersion: v1
kind: Pod
metadata:
  name: app
spec:
  securityContext:
    runAsNonRoot: true  # ✅ Enforce non-root
    runAsUser: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault

  containers:
  - name: app
    image: myapp:1.2.3@sha256:abc123...  # ✅ Pinned with digest
    imagePullPolicy: IfNotPresent

    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true  # ✅ Read-only filesystem
      capabilities:
        drop:
        - ALL  # ✅ Drop all capabilities

    resources:
      requests:
        cpu: 100m
        memory: 128Mi
      limits:
        cpu: 500m
        memory: 512Mi

    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
      initialDelaySeconds: 30
      periodSeconds: 10

    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      initialDelaySeconds: 5
      periodSeconds: 5

    volumeMounts:
    - name: tmp
      mountPath: /tmp  # ✅ Writable tmp dir
    - name: cache
      mountPath: /app/cache

  volumes:
  - name: tmp
    emptyDir: {}
  - name: cache
    emptyDir: {}

# ✅ GOOD: Network Policy
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: app-netpol
spec:
  podSelector:
    matchLabels:
      app: myapp
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend  # ✅ Only allow from frontend
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: database  # ✅ Only allow to database
    ports:
    - protocol: TCP
      port: 5432
  - to:  # ✅ Allow DNS
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: UDP
      port: 53

# ✅ GOOD: RBAC
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-sa
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app-role
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list"]  # ✅ Read-only ConfigMaps
- apiGroups: [""]
  resources: ["secrets"]
  resourceNames: ["app-secrets"]  # ✅ Only specific secret
  verbs: ["get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: app-rolebinding
subjects:
- kind: ServiceAccount
  name: app-sa
roleRef:
  kind: Role
  name: app-role
  apiGroup: rbac.authorization.k8s.io
```

## Step 5: Generate Findings

For each infrastructure issue discovered:

**Finding format:**
```
## INF-{N}: {Short title}
**File**: {file_path}:{line_number}
**Severity**: BLOCKER | HIGH | MED | LOW | NIT
**Confidence**: 95% | 80% | 60%
**Category**: IAM | Network | Secrets | Compute | Availability | Observability | State

### Evidence
{Code snippet showing the issue}

### Issue
{Description of infrastructure problem and blast radius}

### Remediation
{Before and after code with explanation}

### Blast Radius
{Impact assessment: which environments, services affected}
```

**Severity guidelines:**
- **BLOCKER**: Critical security issue (public database, wildcard IAM, exposed secrets)
- **HIGH**: Significant security or reliability risk (single-AZ, missing backups, overly permissive)
- **MED**: Best practice violation (missing tags, no monitoring, suboptimal config)
- **LOW**: Minor improvement (better naming, documentation, optimization)
- **NIT**: Style/consistency (formatting, comments)

**Confidence guidelines:**
- **95%+**: Clear violation (public S3, hardcoded secret, 0.0.0.0/0 SSH)
- **80%**: Likely violation (overly broad policy, missing HA)
- **60%**: Context-dependent (may be intentional for dev environment)

## Step 6: Cross-Reference with Patterns

Check if issues match known patterns:

1. **Wildcard IAM pattern**: `Action: "*"` or `Resource: "*"`
2. **Public exposure pattern**: 0.0.0.0/0 in security groups, public S3 buckets
3. **Hardcoded secret pattern**: Passwords, API keys in config
4. **Single point of failure pattern**: Single-AZ, single replica, no backups
5. **Missing observability pattern**: No logs, metrics, or alerts
6. **Insecure default pattern**: Running as root, no resource limits
7. **State risk pattern**: Local Terraform state, no locking

## Step 7: Write Report

Create report at `.claude/<SESSION_SLUG>/reviews/infra_<timestamp>.md`:

```markdown
# Infrastructure Review Report

**Session**: <SESSION_SLUG>
**Scope**: <SCOPE>
**Target**: <TARGET>
**Date**: <YYYY-MM-DD>
**Reviewer**: Claude (Infrastructure Security & Reliability Specialist)

## 0) Scope & Environment Context

- **IaC Tool**: {Terraform/K8s/Helm/etc}
- **Environments**: {dev/staging/production}
- **Compliance**: {SOC2/HIPAA/PCI-DSS/none}
- **Availability target**: {99.9%/99.99%/99.999%}
- **Files reviewed**: {count}

## 1) Infrastructure Issues (ranked by severity)

{List all findings with severity and category}

## 2) Critical Security Issues

{BLOCKER severity findings that expose the system}

## 3) Blast Radius Assessment

{For each BLOCKER/HIGH finding, assess impact scope}

## 4) Compliance Gaps

{If compliance context provided, map findings to requirements}

## 5) Remediation Priority

### Immediate (Fix before merge)
- {BLOCKER findings}

### High Priority (Fix within 1 week)
- {HIGH findings}

### Medium Priority (Address in next sprint)
- {MED findings}

## 6) Non-Negotiables

1. **No wildcard IAM permissions** in production
2. **All secrets in secret manager**, not config files
3. **Multi-AZ for production databases**
4. **Resource limits on all K8s pods**
5. **Security groups follow least privilege** (no 0.0.0.0/0 on sensitive ports)

## 7) Summary Statistics

- **Total issues**: {count}
- **BLOCKER**: {count} (security exposure)
- **HIGH**: {count} (reliability risk)
- **MED**: {count} (best practices)
- **Environments affected**: {list}

---

{Detailed findings follow below}
```

## Step 8: Output Summary

Output to user:
```
✅ Infrastructure review complete

📊 Summary:
- Files reviewed: {count}
- Issues found: {count}
- BLOCKER: {count} (security exposure)
- HIGH: {count} (reliability risk)
- MED: {count}

📝 Report: .claude/<SESSION_SLUG>/reviews/infra_<timestamp>.md

⚠️ Critical security issues:
{List BLOCKER findings}

💡 Next steps:
1. Fix BLOCKER issues immediately (security exposure)
2. Review blast radius for HIGH issues
3. Plan remediation for MED issues
4. Run security scanner (tfsec, checkov, kube-bench)
```

## Step 9: Example Findings

Below are realistic examples following the finding format:

---

### Example Finding 1: Wildcard IAM Policy

```markdown
## INF-1: IAM policy grants wildcard permissions on all resources

**File**: terraform/iam.tf:23
**Severity**: BLOCKER
**Confidence**: 95%
**Category**: IAM

### Evidence
```hcl
// terraform/iam.tf:23-38
resource "aws_iam_policy" "app_policy" {
  name        = "app-service-policy"
  description = "Policy for application service"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "*"  # ❌ ALL actions
        Resource = "*"  # ❌ ALL resources
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "app_attach" {
  role       = aws_iam_role.app_role.name
  policy_arn = aws_iam_policy.app_policy.arn
}
```

### Issue
The IAM policy grants wildcard permissions (`Action: "*"` and `Resource: "*"`), allowing the application service to perform ANY action on ANY AWS resource. This violates the principle of least privilege.

**Security implications**:
1. **Complete account access**: Service can read/write/delete any resource
2. **Data exfiltration**: Can copy all S3 buckets, RDS snapshots, etc.
3. **Privilege escalation**: Can create new admin users
4. **Resource deletion**: Can terminate EC2 instances, delete databases
5. **Cost explosion**: Can create expensive resources

**Attack scenario**:
1. Attacker compromises application (SSRF, RCE, etc.)
2. Uses application's IAM role credentials
3. Exfiltrates all data, creates backdoor users, deletes resources

**Compliance**: Violates SOC2 CC6.3 (logical access), AWS Well-Architected Framework, CIS AWS Benchmarks

### Remediation

**BEFORE**:
```hcl
resource "aws_iam_policy" "app_policy" {
  name = "app-service-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "*"
        Resource = "*"
      }
    ]
  })
}
```

**AFTER** (Least privilege):
```hcl
resource "aws_iam_policy" "app_policy" {
  name = "app-service-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # S3: Read/write specific bucket
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "arn:aws:s3:::myapp-uploads/*"  # ✅ Specific bucket path
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = "arn:aws:s3:::myapp-uploads"
      },

      # DynamoDB: Read/write specific table
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          "arn:aws:dynamodb:us-east-1:123456789012:table/myapp-users",
          "arn:aws:dynamodb:us-east-1:123456789012:table/myapp-users/index/*"
        ]
      },

      # SQS: Send messages to specific queue
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = "arn:aws:sqs:us-east-1:123456789012:myapp-jobs"
      },

      # Secrets Manager: Read specific secret
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:us-east-1:123456789012:secret:myapp/db-*"
      },

      # CloudWatch: Write logs
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/myapp-*"
      }
    ]
  })
}
```

**Changes**:
1. ✅ Replaced `Action: "*"` with specific required actions
2. ✅ Replaced `Resource: "*"` with specific resource ARNs
3. ✅ Scoped to only the resources the app actually uses
4. ✅ Added comments explaining each permission block

**Verification**:
```bash
# Test that app still works with restricted permissions
terraform apply
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:role/app-role \
  --action-names s3:GetObject dynamodb:GetItem \
  --resource-arns arn:aws:s3:::myapp-uploads/* arn:aws:dynamodb:us-east-1:123456789012:table/myapp-users

# Should return "allowed" for these specific actions
```

### Blast Radius
- **Current risk**: Complete AWS account compromise
- **After fix**: App can only access specific S3 bucket, DynamoDB tables, SQS queue
- **Environments**: Production (HIGH RISK), staging
- **Estimated time to fix**: 1 hour (identify required permissions, test)
```

---

### Example Finding 2: Database in Public Subnet with Open Access

```markdown
## INF-2: RDS database exposed to internet with open security group

**File**: terraform/rds.tf:12
**Severity**: BLOCKER
**Confidence**: 95%
**Category**: Network

### Evidence
```hcl
// terraform/rds.tf:12-30
resource "aws_db_instance" "app_db" {
  identifier     = "app-database"
  engine         = "postgres"
  engine_version = "14.7"
  instance_class = "db.t3.medium"

  allocated_storage = 100
  storage_encrypted = false  # ❌ Not encrypted

  db_name  = "myapp"
  username = "admin"
  password = var.db_password

  publicly_accessible    = true  # ❌ Public IP address
  db_subnet_group_name   = aws_db_subnet_group.public.name
  vpc_security_group_ids = [aws_security_group.db_sg.id]

  backup_retention_period = 0  # ❌ No backups
  skip_final_snapshot     = true
}

// terraform/security_groups.tf:45-56
resource "aws_security_group" "db_sg" {
  name = "database-sg"

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # ❌ Open to internet
    description = "PostgreSQL access"
  }
}
```

### Issue
The RDS database has **MULTIPLE critical security issues**:

1. **Publicly accessible**: Database has public IP and is exposed to internet
2. **Open security group**: Allows PostgreSQL access from 0.0.0.0/0 (entire internet)
3. **No encryption**: Data not encrypted at rest
4. **No backups**: Backup retention set to 0 days (data loss risk)

**Security implications**:
1. **Internet-exposed database**: Attackers can directly attempt to connect
2. **Brute force attacks**: Password can be brute-forced from anywhere
3. **Data breach**: If credentials compromised, entire database exposed
4. **Data loss**: No backups means unrecoverable data loss on failure
5. **Compliance violation**: Violates PCI-DSS, HIPAA, SOC2 requirements

**Attack scenario**:
1. Attacker scans internet for PostgreSQL (port 5432)
2. Finds database at public IP
3. Brute forces weak password or exploits PostgreSQL vulnerability
4. Dumps entire database (customer data, PII, etc.)

**Real-world examples**:
- MongoDB ransom attacks (2017-2020): 100,000+ databases exposed
- Elasticsearch breaches (2019-2021): Billions of records exposed
- Exposed databases on Shodan: 1,000+ PostgreSQL databases public

### Remediation

**BEFORE**:
```hcl
resource "aws_db_instance" "app_db" {
  identifier              = "app-database"
  engine                  = "postgres"
  instance_class          = "db.t3.medium"
  publicly_accessible     = true  # ❌ Public
  db_subnet_group_name    = aws_db_subnet_group.public.name
  vpc_security_group_ids  = [aws_security_group.db_sg.id]
  storage_encrypted       = false  # ❌ Not encrypted
  backup_retention_period = 0  # ❌ No backups
}

resource "aws_security_group" "db_sg" {
  name = "database-sg"
  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # ❌ Open to world
  }
}
```

**AFTER** (Secure configuration):
```hcl
# Create private subnets for database
resource "aws_db_subnet_group" "private" {
  name       = "app-db-private-subnets"
  subnet_ids = [
    aws_subnet.private_a.id,
    aws_subnet.private_b.id
  ]

  tags = {
    Name = "Private DB subnet group"
  }
}

# Secure database configuration
resource "aws_db_instance" "app_db" {
  identifier     = "app-database"
  engine         = "postgres"
  engine_version = "14.7"
  instance_class = "db.t3.medium"

  allocated_storage = 100
  storage_encrypted = true  # ✅ Encrypt at rest
  kms_key_id       = aws_kms_key.db_key.arn

  db_name  = "myapp"
  username = "admin"
  password = random_password.db_password.result

  # Network security
  publicly_accessible    = false  # ✅ Private only
  db_subnet_group_name   = aws_db_subnet_group.private.name
  vpc_security_group_ids = [aws_security_group.db_sg.id]

  # High availability
  multi_az = true  # ✅ Multi-AZ for HA

  # Backups
  backup_retention_period = 7  # ✅ 7 days of backups
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"

  # Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = true
  monitoring_interval             = 60
  monitoring_role_arn            = aws_iam_role.rds_monitoring.arn

  # Protection
  deletion_protection = true  # ✅ Prevent accidental deletion
  skip_final_snapshot = false
  final_snapshot_identifier = "app-db-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  tags = {
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# Restricted security group
resource "aws_security_group" "db_sg" {
  name        = "database-sg"
  description = "Security group for RDS database"
  vpc_id      = aws_vpc.main.id

  # Only allow from application security group
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app_sg.id]  # ✅ Only from app
    description     = "PostgreSQL from app servers"
  }

  # Optional: Allow from bastion for admin access
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.bastion_sg.id]
    description     = "PostgreSQL from bastion (admin access)"
  }

  # No egress needed for database
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = []  # ✅ No outbound (defense in depth)
  }

  tags = {
    Name = "database-sg"
  }
}

# KMS key for encryption
resource "aws_kms_key" "db_key" {
  description             = "KMS key for RDS encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name = "rds-encryption-key"
  }
}

# Random password stored in Secrets Manager
resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "db_password" {
  name = "myapp/db/password"

  rotation_rules {
    automatically_after_days = 30
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# CloudWatch alarms
resource "aws_cloudwatch_metric_alarm" "db_cpu" {
  alarm_name          = "app-db-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Database CPU exceeds 80%"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.app_db.id
  }
}
```

**Changes**:
1. ✅ Moved database to private subnet (no public IP)
2. ✅ Restricted security group to only app servers (removed 0.0.0.0/0)
3. ✅ Enabled encryption at rest with KMS
4. ✅ Enabled Multi-AZ for high availability
5. ✅ Configured 7-day backup retention
6. ✅ Added CloudWatch logs and Performance Insights
7. ✅ Enabled deletion protection
8. ✅ Stored password in Secrets Manager with rotation

**Migration steps**:
```bash
# 1. Create read replica (for minimal downtime)
terraform apply -target=aws_db_instance.app_db_replica

# 2. Switch application to read replica
# Update app config to use replica endpoint

# 3. Take final snapshot of old database
aws rds create-db-snapshot \
  --db-instance-identifier app-database \
  --db-snapshot-identifier app-database-migration-snapshot

# 4. Destroy old public database
terraform destroy -target=aws_db_instance.app_db

# 5. Create new private database
terraform apply

# 6. Restore from snapshot if needed
# Or use DMS for live migration
```

### Blast Radius
- **Current risk**: CRITICAL - Entire database exposed to internet
- **Data at risk**: All customer data, PII, payment info
- **After fix**: Database only accessible from VPC, encrypted, backed up
- **Environments**: Production (CRITICAL), staging (HIGH)
- **Estimated time to fix**: 4-6 hours (includes migration planning)
- **Downtime required**: ~5 minutes (for DNS cutover)
```

---

### Example Finding 3: Hardcoded Secrets in Kubernetes ConfigMap

```markdown
## INF-3: Database credentials stored in plain text ConfigMap

**File**: k8s/app-config.yaml:8
**Severity**: BLOCKER
**Confidence**: 95%
**Category**: Secrets

### Evidence
```yaml
# k8s/app-config.yaml:8-18
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  DATABASE_URL: "postgresql://admin:MySecretPass123@db.example.com:5432/myapp"  # ❌ Credentials in plain text
  API_KEY: "sk_live_abc123def456ghi789"  # ❌ API key exposed
  JWT_SECRET: "super-secret-jwt-key-do-not-share"  # ❌ JWT secret exposed
  AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE"  # ❌ AWS credentials
  AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"  # ❌ Secret key

---
# k8s/deployment.yaml:20-30
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
      - name: app
        image: myapp:1.2.3
        envFrom:
        - configMapRef:
            name: app-config  # ❌ Loads plain text secrets as env vars
```

### Issue
Sensitive credentials are stored in a Kubernetes ConfigMap, which is **NOT designed for secrets**:

**Security problems**:
1. **Plain text storage**: ConfigMaps are not encrypted at rest by default
2. **Visible in logs**: ConfigMap contents appear in kubectl output
3. **RBAC exposure**: Anyone with ConfigMap read access can see secrets
4. **Git history**: If committed, secrets are in version control forever
5. **Audit trail**: Hard to track who accessed secrets

**Attack vectors**:
1. **RBAC bypass**: Developer with ConfigMap read can steal production secrets
2. **Log leakage**: Secrets appear in CI/CD logs, kubectl output
3. **Git exposure**: Secrets committed to repository
4. **Backup exposure**: ConfigMaps backed up in plain text
5. **etcd access**: Anyone with etcd access can read all ConfigMaps

**Compliance**: Violates PCI-DSS 3.4, SOC2 CC6.1, GDPR Article 32

**Real-world examples**:
- Uber breach (2016): AWS keys in GitHub
- Tesla breach (2018): K8s cluster exposed with secrets in ConfigMaps
- Toyota breach (2019): AWS credentials in public repo

### Remediation

**BEFORE**:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  DATABASE_URL: "postgresql://admin:MySecretPass123@db:5432/myapp"
  API_KEY: "sk_live_abc123def456ghi789"
  JWT_SECRET: "super-secret-jwt-key"
  AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE"
  AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
```

**AFTER** (Option 1: Kubernetes Secrets):
```yaml
# Separate config (non-secret) from secrets
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: production
data:
  LOG_LEVEL: "info"  # ✅ Non-sensitive config
  FEATURE_FLAGS: "new_ui=true,beta_access=false"

---
# Use Kubernetes Secret (encrypted at rest if enabled)
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: production
type: Opaque
stringData:  # Will be base64 encoded automatically
  database-url: "postgresql://admin:GENERATED_PASSWORD@db:5432/myapp"
  api-key: "sk_live_abc123def456ghi789"
  jwt-secret: "GENERATED_JWT_SECRET"

---
# Mount as files (better than env vars)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      containers:
      - name: app
        image: myapp:1.2.3

        # ✅ Non-sensitive config as env vars
        envFrom:
        - configMapRef:
            name: app-config

        # ✅ Secrets mounted as files
        volumeMounts:
        - name: secrets
          mountPath: "/etc/secrets"
          readOnly: true

      volumes:
      - name: secrets
        secret:
          secretName: app-secrets
          defaultMode: 0400  # ✅ Read-only for owner

# Application reads: /etc/secrets/database-url
```

**AFTER** (Option 2: External Secrets Operator - RECOMMENDED):
```yaml
# Install External Secrets Operator
# kubectl apply -f https://raw.githubusercontent.com/external-secrets/external-secrets/main/deploy/crds/bundle.yaml

# Configure AWS Secrets Manager backend
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: production
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa  # ✅ Uses IAM role (IRSA)

---
# ExternalSecret fetches from AWS Secrets Manager
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: app-secrets
  namespace: production
spec:
  refreshInterval: 1h  # ✅ Auto-refresh from Secrets Manager
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore

  target:
    name: app-secrets  # Creates K8s Secret
    creationPolicy: Owner

  data:
  - secretKey: database-url
    remoteRef:
      key: production/app/database-url  # ✅ Fetched from AWS Secrets Manager

  - secretKey: api-key
    remoteRef:
      key: production/app/api-key

  - secretKey: jwt-secret
    remoteRef:
      key: production/app/jwt-secret

---
# Deployment uses the generated Secret
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  template:
    spec:
      serviceAccountName: app-sa  # ✅ IRSA for AWS access

      containers:
      - name: app
        image: myapp:1.2.3

        volumeMounts:
        - name: secrets
          mountPath: "/etc/secrets"
          readOnly: true

      volumes:
      - name: secrets
        secret:
          secretName: app-secrets  # ✅ Synced from Secrets Manager
```

**AFTER** (Option 3: Sealed Secrets - for GitOps):
```bash
# Install Sealed Secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.18.0/controller.yaml

# Create secret and seal it
kubectl create secret generic app-secrets \
  --from-literal=database-url="postgresql://..." \
  --dry-run=client -o yaml | \
  kubeseal -o yaml > sealed-secret.yaml

# sealed-secret.yaml (safe to commit to Git)
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: app-secrets
  namespace: production
spec:
  encryptedData:
    database-url: AgC7... # ✅ Encrypted, can only be decrypted by cluster
    api-key: AgB9...
```

**Changes**:
1. ✅ Moved secrets from ConfigMap to Kubernetes Secret
2. ✅ OR use External Secrets Operator (fetch from AWS Secrets Manager)
3. ✅ OR use Sealed Secrets (encrypted secrets in Git)
4. ✅ Mount secrets as files instead of env vars (more secure)
5. ✅ Rotate all exposed credentials immediately
6. ✅ Enable encryption at rest for Kubernetes Secrets

**Enable encryption at rest (if not already enabled)**:
```yaml
# /etc/kubernetes/encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
    - secrets
    providers:
    - aescbc:
        keys:
        - name: key1
          secret: <base64 encoded 32 byte key>
    - identity: {}  # Fallback to unencrypted
```

```bash
# Restart API server with encryption config
kube-apiserver --encryption-provider-config=/etc/kubernetes/encryption-config.yaml

# Re-encrypt all existing secrets
kubectl get secrets --all-namespaces -o json | kubectl replace -f -
```

**Immediate actions**:
```bash
# 1. Rotate all exposed credentials
aws secretsmanager rotate-secret --secret-id production/app/database-url
# Update database password, API keys, JWT secret

# 2. Delete ConfigMap with secrets
kubectl delete configmap app-config -n production

# 3. Create proper Secrets
kubectl apply -f k8s/secrets.yaml

# 4. Audit who had access
kubectl get rolebindings,clusterrolebindings --all-namespaces -o yaml | grep app-config

# 5. Check if secrets were committed to Git
git log -p -- k8s/app-config.yaml
# If found, consider repository compromise
```

### Blast Radius
- **Current risk**: CRITICAL - All production credentials exposed
- **Credentials compromised**: Database, API keys, JWT secret, AWS credentials
- **After fix**: Secrets encrypted, access audited, rotation enabled
- **Environments**: Production (CRITICAL), staging (HIGH)
- **Immediate action required**:
  1. Rotate ALL exposed credentials (database, API keys, AWS keys)
  2. Audit access logs to ConfigMap
  3. Scan Git history for committed secrets
  4. Notify security team for incident response
- **Estimated time to fix**: 2-3 hours (urgent rotation + proper secret storage)
```

---

## Step 10: False Positives Welcome

Not every finding is a bug:

1. **Dev/test environments**: Less strict security acceptable in non-production
2. **Temporary config**: Short-lived test resources may skip some hardening
3. **Intentional public access**: Some resources (static sites, public APIs) should be public
4. **Legacy migration**: Older infrastructure may need gradual improvement
5. **Cost tradeoffs**: Multi-AZ may be overkill for non-critical dev environments

**Risk-based approach**:
- **Production**: Zero tolerance for security issues
- **Staging**: High standards, some flexibility for testing
- **Dev**: Pragmatic security, focus on education

---

## Infrastructure Security Testing Tools

### AWS
```bash
# tfsec - Terraform security scanner
brew install tfsec
tfsec .

# checkov - Multi-cloud security scanner
pip install checkov
checkov -d .

# AWS Config rules
aws configservice describe-compliance-by-config-rule

# AWS IAM Access Analyzer
aws accessanalyzer list-findings
```

### Kubernetes
```bash
# kube-bench - CIS Kubernetes benchmark
kubectl apply -f https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml
kubectl logs job/kube-bench

# kubescape - K8s security scanner
curl -s https://raw.githubusercontent.com/kubescape/kubescape/master/install.sh | /bin/bash
kubescape scan --enable-host-scan

# Polaris - K8s best practices
kubectl apply -f https://github.com/FairwindsOps/polaris/releases/latest/download/dashboard.yaml
kubectl port-forward -n polaris svc/polaris-dashboard 8080:80
```

### General
```bash
# Terraform plan review
terraform plan -out=tfplan.binary
terraform show -json tfplan.binary | jq > tfplan.json

# Git secrets scanning
git-secrets --scan

# Trivy - Container/IaC scanner
trivy config .
trivy image myapp:1.2.3
```

---

**Remember**: Infrastructure security is defense in depth. No single control is perfect—layer multiple controls (network, IAM, encryption, monitoring) for comprehensive protection.
