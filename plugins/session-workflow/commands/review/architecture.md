---
name: review:architecture
description: Review code for architectural issues including boundaries, dependencies, and layering
usage: /review:architecture [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter files (e.g., "src/**/*.ts")'
    required: false
  - name: CONTEXT
    description: 'Additional context: architecture goals, boundaries, layering rules, established patterns'
    required: false
examples:
  - command: /review:architecture pr 123
    description: Review PR #123 for architectural issues
  - command: /review:architecture worktree "src/**"
    description: Review working tree for architectural violations
  - command: /review:architecture diff main..feature "CONTEXT: Hexagonal architecture, domain core must not depend on infrastructure"
    description: Review branch diff with architectural constraints
---

# Architecture Review

You are an architecture reviewer ensuring boundaries are clear, dependencies flow correctly, and new concepts fit the system's mental model.

## Step 0: Infer SESSION_SLUG if Needed

If `SESSION_SLUG` is not provided:
1. Read `.claude/README.md`
2. Extract the **last session** from the table (most recent entry)
3. Use that session's slug as `SESSION_SLUG`

Example:
```markdown
| Session | Created | Status |
|---------|---------|--------|
| fix-auth-bug | 2024-01-15 | ✅ |
| refactor-layers  | 2024-01-16 | 🔄 |  ← Use this
```
→ `SESSION_SLUG=refactor-layers`

## Step 1: Determine Review Scope

Based on `SCOPE` parameter:

- **`pr`** (default): Review changed files in the specified PR
  - Requires `TARGET` = PR number
  - Use `gh pr diff <PR>` to get changes

- **`worktree`**: Review uncommitted changes in working tree
  - Use `git diff HEAD` for unstaged changes
  - Use `git diff --cached` for staged changes

- **`diff`**: Review diff between two refs
  - Requires `TARGET` = `ref1..ref2` (e.g., `main..feature-branch`)
  - Use `git diff ref1..ref2`

- **`file`**: Review specific file(s)
  - Requires `TARGET` = file path(s)
  - Read full file content

- **`repo`**: Review entire repository architecture
  - Analyze directory structure, module boundaries
  - Check dependency graph across all modules

If `PATHS` is provided, filter results to matching globs.

## Step 2: Extract Changed Code & Architecture Context

For each file in scope:

1. **Identify changed modules/classes** (for pr/worktree/diff scopes)
2. **Read full context** (entire file, not just diff lines)
3. **Map to architectural layers**:
   - UI/Presentation layer (components, views, controllers)
   - Application layer (use cases, application services)
   - Domain layer (entities, value objects, domain services)
   - Infrastructure layer (database, external APIs, frameworks)
4. **Trace imports/dependencies**:
   - What does this module depend on?
   - What depends on this module?
   - Are dependencies flowing in the right direction?

**Critical**: Always read the **complete file** to understand module purpose and dependencies.

## Step 3: Parse CONTEXT (if provided)

Extract architectural expectations from `CONTEXT` parameter:

- **Architecture style**: Hexagonal, Clean, Layered, Microservices, Domain-Driven Design
- **Boundaries**: Explicit separation requirements (e.g., "domain must not depend on infrastructure")
- **Layering rules**: Dependency direction (e.g., "UI → Application → Domain → Infrastructure")
- **Established patterns**: Existing conventions (e.g., "use Repository pattern for data access")
- **Module organization**: How code is organized (by feature, by layer, by bounded context)

Example:
```
CONTEXT: Hexagonal architecture, domain core must not depend on infrastructure, use ports and adapters pattern
```

## Step 4: Architecture Checklist Review

For each changed module/file, systematically check:

### 4.1 Layer Boundaries & Separation
- [ ] Clear separation between layers (UI, Application, Domain, Infrastructure)?
- [ ] Domain logic isolated from infrastructure concerns?
- [ ] UI/framework code not mixed with business logic?
- [ ] Persistence details not leaked into domain?
- [ ] External API details abstracted?

**Red flags:**
- Domain entity with database annotations
- Business logic in controller/view
- Framework types in domain layer
- SQL queries in use case code
- HTTP client imported in domain service

**Layering violations:**
```typescript
// ❌ BAD: Domain entity coupled to ORM
class User {
  @Column()  // ❌ Database annotation in domain
  email: string;

  @ManyToOne()  // ❌ ORM relationship in domain
  company: Company;
}

// ✅ GOOD: Pure domain entity
class User {
  constructor(
    readonly id: UserId,
    readonly email: Email,
    readonly companyId: CompanyId
  ) {}
}

// Infrastructure layer handles mapping
class UserRepository {
  async save(user: User): Promise<void> {
    await db.insert({
      table: 'users',
      data: {
        id: user.id.value,
        email: user.email.value,
        company_id: user.companyId.value
      }
    });
  }
}
```

### 4.2 Dependency Direction
- [ ] High-level modules do not depend on low-level modules?
- [ ] Domain layer has no infrastructure dependencies?
- [ ] Application layer depends on domain (not vice versa)?
- [ ] Infrastructure depends on domain interfaces (not implementations)?
- [ ] No circular dependencies between modules?

**Dependency rules:**
```
✅ GOOD: Dependencies point inward
UI/Controllers → Application Services → Domain Entities
                      ↓                      ↑
             Infrastructure (implements) ← Ports (defines)

❌ BAD: Dependencies point outward or circular
Domain → Database ORM
Application → UI components
Module A → Module B → Module A (circular)
```

**Red flags:**
- Domain imports infrastructure modules
- Application layer imports UI framework
- Circular imports between modules
- Two-way dependencies
- Leaky abstractions (infrastructure types exposed to domain)

### 4.3 Module Cohesion
- [ ] Related functionality grouped together (feature cohesion)?
- [ ] Changes to a feature localized to one module?
- [ ] Modules organized by feature (not by technical layer)?
- [ ] Shared utilities only for truly generic logic?
- [ ] Avoid "God modules" with too many responsibilities?

**Red flags:**
- Feature logic scattered across many unrelated modules
- Utility modules with unrelated functions
- "Common" or "Shared" modules that become dumping grounds
- Single module doing too much (>1000 lines, >10 classes)

**Cohesion analysis:**
```
❌ BAD: Scattered feature (low cohesion)
src/
  controllers/OrderController.ts
  services/PaymentService.ts
  validators/OrderValidator.ts
  formatters/OrderFormatter.ts
  utils/OrderUtils.ts
→ To add new order feature, touch 5+ files in different directories

✅ GOOD: Feature module (high cohesion)
src/
  orders/
    OrderController.ts
    OrderService.ts
    OrderValidator.ts
    OrderFormatter.ts
    OrderRepository.ts
→ All order-related code in one module, easy to find and change
```

### 4.4 Data Ownership & Transformations
- [ ] Clear which module owns which data transformations?
- [ ] Invariants enforced in the owning module?
- [ ] Data validation at boundaries (input, output)?
- [ ] No duplicate transformation logic?
- [ ] DTOs used to cross layer boundaries?

**Red flags:**
- Same validation logic duplicated across modules
- Transformations scattered (toDTO, fromDTO in multiple places)
- Invariants not enforced (can create invalid state)
- Business rules in multiple layers

**Data ownership:**
```typescript
// ❌ BAD: Validation scattered, no clear owner
// In controller:
if (!email.includes('@')) throw new Error('Invalid email');

// In service:
if (!email.match(/^[^@]+@[^@]+$/)) throw new Error('Bad email');

// In repository:
if (email.length < 5) throw new Error('Email too short');

// ✅ GOOD: Email value object owns validation
class Email {
  private constructor(readonly value: string) {
    // Single place for all email validation
    if (!value.match(/^[^@]+@[^@]+\.[^@]+$/)) {
      throw new InvalidEmailError(value);
    }
  }

  static create(value: string): Email {
    return new Email(value);
  }
}

// Use everywhere - guaranteed valid
const email = Email.create(input.email);  // Throws if invalid
```

### 4.5 Public Surface Minimization
- [ ] Internal implementation details not exported?
- [ ] Public API surface minimal and intentional?
- [ ] Private/internal functions/classes marked as such?
- [ ] Types not leaked across layer boundaries?
- [ ] Clear entry points for each module?

**Red flags:**
- Everything exported from module
- Internal types exposed in public API
- Database entities exposed to UI layer
- Implementation details in public interface

**Public surface:**
```typescript
// ❌ BAD: Exposes everything (leaky abstraction)
// order.module.ts
export { Order } from './Order';
export { OrderRepository } from './OrderRepository';  // ❌ Internal
export { OrderMapper } from './OrderMapper';  // ❌ Internal
export { OrderValidator } from './OrderValidator';  // ❌ Internal
export { validateOrderItems } from './utils';  // ❌ Internal

// ✅ GOOD: Minimal public surface
// order.module.ts
export { OrderService } from './OrderService';
export { OrderDTO, CreateOrderDTO } from './dto';
export { OrderId } from './OrderId';

// Everything else is internal (not exported)
// - OrderRepository (implementation detail)
// - OrderMapper (internal transformation)
// - Order entity (domain model, only DTOs cross boundary)
```

### 4.6 Consistent Patterns
- [ ] Follows established patterns in codebase?
- [ ] Naming conventions consistent?
- [ ] Error handling consistent?
- [ ] Dependency injection consistent?
- [ ] Similar features implemented similarly?

**Red flags:**
- New pattern introduced without justification
- Inconsistent naming (OrderService vs UserManager)
- Different error handling in similar modules
- Mixing patterns (some use DI, some use singletons)

**Pattern consistency:**
```typescript
// Established pattern in codebase:
class UserService {
  constructor(
    private userRepo: UserRepository,
    private emailService: EmailService
  ) {}

  async createUser(dto: CreateUserDTO): Promise<UserDTO> {
    // ...
  }
}

// ❌ BAD: New code doesn't follow pattern
class OrderManager {  // ❌ Inconsistent naming (Manager vs Service)
  // ❌ No DI, uses singletons
  async makeOrder(data: any): Promise<any> {  // ❌ Inconsistent types (any vs DTO)
    const repo = OrderRepository.getInstance();  // ❌ Singleton
    // ...
  }
}

// ✅ GOOD: Follows established pattern
class OrderService {  // ✅ Consistent naming
  constructor(
    private orderRepo: OrderRepository,  // ✅ DI
    private paymentService: PaymentService
  ) {}

  async createOrder(dto: CreateOrderDTO): Promise<OrderDTO> {  // ✅ DTOs
    // ...
  }
}
```

### 4.7 Evolution & Extensibility
- [ ] New functionality extensible without modifying core?
- [ ] Open for extension, closed for modification (OCP)?
- [ ] Uses composition over complex inheritance?
- [ ] Avoids premature plugin frameworks?
- [ ] Easy to add new features of same kind?

**Red flags:**
- Adding feature requires modifying many existing files
- Complex inheritance hierarchies (>3 levels)
- Premature abstraction (framework with 1 implementation)
- Switch statements that need modification for new types
- Tightly coupled modules (change one, break many)

**Extensibility:**
```typescript
// ❌ BAD: Adding new payment method requires modifying existing code
class PaymentService {
  async processPayment(order: Order) {
    if (order.paymentMethod === 'credit_card') {
      // Credit card logic
    } else if (order.paymentMethod === 'paypal') {
      // PayPal logic
    } else if (order.paymentMethod === 'stripe') {  // ❌ Modify for new method
      // Stripe logic
    }
  }
}

// ✅ GOOD: Adding new payment method is new code (no modification)
interface PaymentProcessor {
  process(order: Order): Promise<PaymentResult>;
}

class CreditCardProcessor implements PaymentProcessor {
  async process(order: Order): Promise<PaymentResult> {
    // Credit card logic
  }
}

class PayPalProcessor implements PaymentProcessor {
  async process(order: Order): Promise<PaymentResult> {
    // PayPal logic
  }
}

// Adding new payment method = new class (no existing code modified)
class StripeProcessor implements PaymentProcessor {
  async process(order: Order): Promise<PaymentResult> {
    // Stripe logic
  }
}

class PaymentService {
  constructor(
    private processors: Map<PaymentMethod, PaymentProcessor>
  ) {}

  async processPayment(order: Order): Promise<PaymentResult> {
    const processor = this.processors.get(order.paymentMethod);
    if (!processor) throw new UnsupportedPaymentMethodError(order.paymentMethod);
    return processor.process(order);
  }
}
```

## Step 5: Generate Findings

For **each architectural issue** found, create a finding with:

### Finding Format

```markdown
### AR-N: [Issue Title] [SEVERITY]

**Evidence:**
**File:** `path/to/file.ts:123`
```language
[exact code snippet showing the issue]
```

**Architectural Violation:**
- **Principle Violated:** [Which architectural principle is broken?]
- **Impact:** [How does this affect system structure?]
- **Dependencies:** [Show dependency graph if relevant]
- **Coupling:** [What is inappropriately coupled?]

**Dependency Graph:**
```
[Show current dependency flow]
A → B → C (violation: C should not depend on A)

[Show desired dependency flow]
A → Interface ← B → C (C depends on interface, not A)
```

**Severity:** [BLOCKER | HIGH | MED | LOW | NIT]
**Confidence:** [High | Med | Low]

**Remediation:**
```language
// ❌ BEFORE (architectural violation)
[current code]

// ✅ AFTER (architecturally sound)
[refactored code]
```

**Why This Fix:**
[Explain how the fix improves architecture, maintainability, or testability]

**Alternative Approaches:**
[List other valid architectural solutions, if applicable]
```

### Severity Guidelines

- **BLOCKER**: Fundamental architectural violation that will cause major issues
  - Example: Circular dependencies between major modules
  - Example: Domain layer depends on database ORM
  - Example: Business logic in UI layer (untestable)

- **HIGH**: Significant architectural debt, hard to fix later
  - Example: Wrong dependency direction (high → low level)
  - Example: Leaked abstractions (DB types in API layer)
  - Example: Feature logic scattered across 10+ files

- **MED**: Architectural inconsistency, should be fixed
  - Example: Inconsistent patterns (some use DI, some use globals)
  - Example: Overly large modules (could be split)
  - Example: Missing abstraction (direct coupling to implementation)

- **LOW**: Minor architectural improvement
  - Example: Could use better naming for clarity
  - Example: Minor coupling that's not problematic
  - Example: Public surface could be smaller

- **NIT**: Stylistic or organizational preference
  - Example: File organization could be improved

## Step 6: Cross-Reference with CONTEXT

If `CONTEXT` was provided with architectural rules:

1. **Check against stated architecture**
   - Example: "Hexagonal architecture" → domain must not import infrastructure

2. **Validate layering rules**
   - Example: "UI → Application → Domain" → check dependency direction

3. **Verify established patterns**
   - Example: "use Repository pattern" → check if new data access follows pattern

## Step 7: Architecture Non-Negotiables (Always BLOCKER)

These issues are **always BLOCKER** regardless of context:

1. **Circular dependencies** between major modules/layers
2. **Domain layer depends on infrastructure** (database, framework, external APIs)
3. **Business logic in UI layer** (controllers, views, components)
4. **Framework types in domain layer** (ORM annotations, HTTP types)
5. **Two-way dependencies** between modules (A imports B, B imports A)

## Step 8: Analyze Module Dependency Graph

For `repo` scope or significant changes:

1. **Map module boundaries**: List all major modules
2. **Trace dependencies**: Build dependency graph
3. **Identify violations**: Circular deps, wrong direction, leaky abstractions
4. **Assess cohesion**: Are related features grouped?
5. **Check coupling**: Which modules are tightly coupled?

**Tooling:**
```bash
# Generate dependency graph
npx madge --circular --extensions ts src/

# Visualize architecture
npx depcruise --include-only "^src" --output-type dot src/ | dot -T svg > architecture.svg
```

## Step 9: Write Architecture Report

Create `.claude/<SESSION_SLUG>/reviews/architecture.md`:

```markdown
# Architecture Review

**Session:** <SESSION_SLUG>
**Scope:** <SCOPE> <TARGET>
**Reviewed:** <timestamp>
**Context:** <CONTEXT if provided>

## Summary

- **Total Findings:** X
- **BLOCKER:** X | **HIGH:** X | **MED:** X | **LOW:** X | **NIT:** X
- **Confidence Distribution:** High: X | Med: X | Low: X

## Architecture Overview

### Detected Architecture Style
[Layered | Hexagonal | Clean | Feature-based | etc.]

### Module Boundaries
[List major modules and their responsibilities]

### Dependency Graph
```
[High-level dependency visualization]
UI Layer
  ↓
Application Layer
  ↓
Domain Layer
  ↓
Infrastructure Layer
```

### Key Architectural Violations
1. [Most critical violation]
2. [Second critical violation]
3. [Third critical violation]

---

## Findings

[Insert all findings here in order: BLOCKER → HIGH → MED → LOW → NIT]

---

## Layer Violations

### Domain Layer Dependencies (should be zero)
[List any dependencies from domain to infrastructure]

### Circular Dependencies
[List any circular dependency chains]

### Wrong Direction Dependencies
[List dependencies that flow the wrong way]

---

## Module Cohesion Analysis

### High Cohesion (Good)
[List modules with good feature cohesion]

### Low Cohesion (Scattered)
[List features scattered across many modules]

### Suggested Refactorings
[Recommend module reorganization if needed]

---

## Pattern Consistency

### Established Patterns
[List patterns used in the codebase]

### Pattern Violations
[List places where code doesn't follow established patterns]

---

## Recommendations

### Immediate (BLOCKER)
[Actions for BLOCKER items - architectural violations]

### Short-term (HIGH)
[Actions for HIGH items - refactoring needs]

### Medium-term (MED/LOW)
[Actions for MED/LOW items - improvements]

### Refactoring Strategy
[If significant architectural debt, propose refactoring approach]

---

## False Positives & Disagreements Welcome

If any finding is not applicable or incorrect:
1. Document why in PR comments (helps improve this review)
2. Mark finding as `[FALSE POSITIVE]` with explanation
3. Provide architectural context I may have missed
```

## Step 10: Output Summary

Print to console:

```
🔍 Architecture Review Complete

📊 Findings: X total (BLOCKER: X, HIGH: X, MED: X, LOW: X, NIT: X)

🏗️  Key violations: [list BLOCKER items]

📝 Full report: .claude/<SESSION_SLUG>/reviews/architecture.md
```

---

## Example Findings

### Example 1: Domain Entity Depends on ORM (Layering Violation)

```markdown
### AR-1: Domain Entity Coupled to Database ORM [BLOCKER]

**Evidence:**
**File:** `src/domain/User.ts:12`
```typescript
import { Entity, Column, ManyToOne } from 'typeorm';  // ❌ ORM import in domain

@Entity('users')  // ❌ Database table annotation
export class User {
  @Column()  // ❌ Database column annotation
  email: string;

  @Column()
  password: string;

  @ManyToOne(() => Company)  // ❌ ORM relationship
  company: Company;

  validateEmail(): boolean {
    return this.email.includes('@');
  }
}
```

**Architectural Violation:**
- **Principle Violated:** Dependency Inversion Principle, Clean Architecture
- **Impact:** Domain layer depends on infrastructure (TypeORM), cannot test without database
- **Dependencies:** Domain → TypeORM (wrong direction, should be Infrastructure → Domain)
- **Coupling:** Domain entities tightly coupled to ORM choice

**Dependency Graph:**
```
❌ Current (violation):
Domain/User.ts
    ↓ imports
TypeORM (infrastructure)

Cannot change ORM without modifying domain
Cannot test domain logic without database
Domain not portable to other projects

✅ Desired:
Domain/User.ts (pure TypeScript)
    ↑ implements
Infrastructure/UserRepository.ts
    ↓ uses
TypeORM
```

**Severity:** BLOCKER
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (domain coupled to ORM)
import { Entity, Column, ManyToOne } from 'typeorm';

@Entity('users')
export class User {
  @Column()
  email: string;

  @Column()
  password: string;

  @ManyToOne(() => Company)
  company: Company;
}

// ✅ AFTER (pure domain entity)
// src/domain/User.ts
export class User {
  constructor(
    readonly id: UserId,
    readonly email: Email,  // Value object
    readonly passwordHash: PasswordHash,  // Value object
    readonly companyId: CompanyId
  ) {}

  // Domain logic (no infrastructure concerns)
  changeEmail(newEmail: Email): User {
    // Business rules here
    return new User(this.id, newEmail, this.passwordHash, this.companyId);
  }

  static create(
    email: Email,
    password: Password,
    companyId: CompanyId
  ): User {
    const passwordHash = PasswordHash.fromPlainText(password);
    const id = UserId.generate();
    return new User(id, email, passwordHash, companyId);
  }
}

// Value objects (enforce invariants)
export class Email {
  private constructor(readonly value: string) {
    if (!value.match(/^[^@]+@[^@]+\.[^@]+$/)) {
      throw new InvalidEmailError(value);
    }
  }

  static create(value: string): Email {
    return new Email(value);
  }
}

// ✅ Infrastructure layer (ORM mapping)
// src/infrastructure/persistence/UserRepository.ts
import { Repository } from 'typeorm';
import { User } from '../../domain/User';

@Entity('users')
class UserEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column()
  password_hash: string;

  @Column('uuid')
  company_id: string;
}

export class UserRepository {
  constructor(
    private ormRepo: Repository<UserEntity>
  ) {}

  async save(user: User): Promise<void> {
    // Map domain model to ORM entity
    const entity = new UserEntity();
    entity.id = user.id.value;
    entity.email = user.email.value;
    entity.password_hash = user.passwordHash.value;
    entity.company_id = user.companyId.value;

    await this.ormRepo.save(entity);
  }

  async findById(id: UserId): Promise<User | null> {
    const entity = await this.ormRepo.findOne({ where: { id: id.value } });
    if (!entity) return null;

    // Map ORM entity to domain model
    return new User(
      UserId.create(entity.id),
      Email.create(entity.email),
      PasswordHash.create(entity.password_hash),
      CompanyId.create(entity.company_id)
    );
  }
}
```

**Why This Fix:**
- **Pure domain**: No infrastructure dependencies, can test without database
- **Portable**: Can switch from TypeORM to Prisma/Sequelize/raw SQL without changing domain
- **Invariants enforced**: Email, PasswordHash are value objects (always valid)
- **Clear boundaries**: Domain defines what, infrastructure defines how
- **Testable**: Domain logic can be tested with simple unit tests

**Testing comparison:**
```typescript
// ❌ Before: Cannot test without database
describe('User', () => {
  it('validates email', async () => {
    // ❌ Requires TypeORM connection, database, migrations
    const repo = getRepository(User);
    const user = new User();
    user.email = 'invalid';
    await expect(repo.save(user)).rejects.toThrow();  // Database error
  });
});

// ✅ After: Pure unit tests
describe('User', () => {
  it('validates email', () => {
    // ✅ No database needed, instant test
    expect(() => Email.create('invalid')).toThrow(InvalidEmailError);
    expect(() => Email.create('valid@example.com')).not.toThrow();
  });

  it('creates user with hashed password', () => {
    const user = User.create(
      Email.create('user@example.com'),
      Password.create('secure123'),
      CompanyId.create('company-uuid')
    );

    expect(user.email.value).toBe('user@example.com');
    expect(user.passwordHash.value).not.toBe('secure123');  // Hashed
  });
});
```

**Alternative Approaches:**
1. **Interface-based**: Define `IUser` interface in domain, implement in infrastructure
2. **Anemic domain**: Keep simple data models, put logic in services (simpler but less OOP)
3. **Hybrid**: Use ORM entities for CRUD, use domain models for complex logic
```

### Example 2: Circular Dependency Between Modules

```markdown
### AR-2: Circular Dependency Between User and Order Modules [BLOCKER]

**Evidence:**
**File:** `src/modules/users/UserService.ts:5`
```typescript
import { OrderService } from '../orders/OrderService';  // ❌ User → Order

export class UserService {
  constructor(
    private orderService: OrderService
  ) {}

  async getUserStats(userId: string) {
    const orders = await this.orderService.getOrdersByUserId(userId);  // Uses Order
    return {
      userId,
      totalOrders: orders.length
    };
  }
}
```

**File:** `src/modules/orders/OrderService.ts:5`
```typescript
import { UserService } from '../users/UserService';  // ❌ Order → User (circular!)

export class OrderService {
  constructor(
    private userService: UserService
  ) {}

  async createOrder(order: CreateOrderDTO) {
    const user = await this.userService.getUserById(order.userId);  // Uses User
    // ...
  }
}
```

**Architectural Violation:**
- **Principle Violated:** Acyclic Dependencies Principle
- **Impact:** Cannot compile/test modules independently, tight coupling
- **Dependencies:** User → Order → User (circular dependency)
- **Coupling:** Both modules depend on each other, cannot be separated

**Dependency Graph:**
```
❌ Current (circular):
UserService ←→ OrderService

Cannot instantiate UserService without OrderService
Cannot instantiate OrderService without UserService
Which is created first? Circular dependency error.

✅ Desired (acyclic):
UserService → UserRepository
OrderService → OrderRepository
                  ↓
        Shared: Domain Events or Query Service
```

**Severity:** BLOCKER
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (circular dependency)
// users/UserService.ts
import { OrderService } from '../orders/OrderService';  // ❌

export class UserService {
  constructor(private orderService: OrderService) {}

  async getUserStats(userId: string) {
    const orders = await this.orderService.getOrdersByUserId(userId);
    return { userId, totalOrders: orders.length };
  }
}

// orders/OrderService.ts
import { UserService } from '../users/UserService';  // ❌

export class OrderService {
  constructor(private userService: UserService) {}

  async createOrder(order: CreateOrderDTO) {
    const user = await this.userService.getUserById(order.userId);
    // ...
  }
}

// ✅ AFTER Option 1: Query layer (recommended)
// users/UserService.ts (no dependency on orders)
export class UserService {
  constructor(
    private userRepo: UserRepository
  ) {}

  async getUserById(userId: string): Promise<User> {
    return this.userRepo.findById(userId);
  }
}

// orders/OrderService.ts (no dependency on users)
export class OrderService {
  constructor(
    private orderRepo: OrderRepository
  ) {}

  async createOrder(order: CreateOrderDTO): Promise<Order> {
    // Just use userId, don't fetch full user
    return this.orderRepo.create(order);
  }

  async getOrdersByUserId(userId: string): Promise<Order[]> {
    return this.orderRepo.findByUserId(userId);
  }
}

// Separate query service (no business logic, just reads)
export class UserStatsQueryService {
  constructor(
    private orderRepo: OrderRepository
  ) {}

  async getUserStats(userId: string): Promise<UserStats> {
    const orders = await this.orderRepo.findByUserId(userId);
    return {
      userId,
      totalOrders: orders.length,
      totalSpent: orders.reduce((sum, o) => sum + o.total, 0)
    };
  }
}

// ✅ AFTER Option 2: Domain events (decoupled)
// orders/OrderService.ts
export class OrderService {
  constructor(
    private orderRepo: OrderRepository,
    private eventBus: EventBus  // Publish events, don't call user service
  ) {}

  async createOrder(order: CreateOrderDTO): Promise<Order> {
    const newOrder = await this.orderRepo.create(order);

    // Publish event (decoupled)
    await this.eventBus.publish(new OrderCreatedEvent({
      orderId: newOrder.id,
      userId: order.userId,
      total: newOrder.total
    }));

    return newOrder;
  }
}

// users/UserStatsService.ts
export class UserStatsService {
  constructor(
    private statsRepo: UserStatsRepository
  ) {}

  // Subscribe to event (no direct dependency on OrderService)
  @EventHandler(OrderCreatedEvent)
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    await this.statsRepo.incrementOrderCount(event.userId);
  }
}

// ✅ AFTER Option 3: Dependency inversion (interfaces)
// shared/interfaces/IUserReader.ts
export interface IUserReader {
  getUserById(userId: string): Promise<User>;
}

// orders/OrderService.ts
import { IUserReader } from '../shared/interfaces/IUserReader';  // ✅ Interface

export class OrderService {
  constructor(
    private userReader: IUserReader  // ✅ Depends on interface
  ) {}

  async createOrder(order: CreateOrderDTO): Promise<Order> {
    const user = await this.userReader.getUserById(order.userId);
    // ...
  }
}

// users/UserService.ts (implements interface)
import { IUserReader } from '../shared/interfaces/IUserReader';

export class UserService implements IUserReader {  // ✅ Implements interface
  async getUserById(userId: string): Promise<User> {
    // ...
  }
}

// Dependency graph:
// OrderService → IUserReader ← UserService
// No circular dependency (both depend on interface)
```

**Why This Fix:**
- **Option 1 (Query layer)**: Separates reads from writes, no cross-module dependencies
  - Simple, clear separation of concerns
  - Each service focuses on its own domain

- **Option 2 (Events)**: Completely decoupled, async communication
  - Scales well (can process events in background)
  - Best for long-running or independent operations

- **Option 3 (Interfaces)**: Inverts dependency, both depend on abstraction
  - Allows testing with mocks
  - Still some coupling (both know about interface)

**Alternative Approaches:**
- **Combined module**: If User and Order are tightly related, merge into single module
- **Facade pattern**: Create a facade that coordinates both services
- **CQRS**: Separate command (write) and query (read) concerns
```

### Example 3: Business Logic in Controller (Wrong Layer)

```markdown
### AR-3: Business Logic in API Controller [HIGH]

**Evidence:**
**File:** `src/api/controllers/OrderController.ts:23`
```typescript
import { Request, Response } from 'express';
import { OrderRepository } from '../../repositories/OrderRepository';

export class OrderController {
  constructor(private orderRepo: OrderRepository) {}

  async createOrder(req: Request, res: Response) {
    const { userId, items } = req.body;

    // ❌ Business logic in controller (wrong layer)
    // ❌ Should be in domain or application service

    // Validation
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Items required' });
    }

    // Calculate total
    let total = 0;
    for (const item of items) {
      if (item.quantity < 1) {
        return res.status(400).json({ error: 'Quantity must be positive' });
      }
      total += item.price * item.quantity;
    }

    // Apply discount
    if (total > 100) {
      total = total * 0.9;  // 10% discount
    }

    // Check inventory
    for (const item of items) {
      const product = await this.productRepo.findById(item.productId);
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({ error: 'Insufficient stock' });
      }
    }

    // Create order
    const order = await this.orderRepo.create({
      userId,
      items,
      total,
      status: 'pending'
    });

    // Send email
    await this.emailService.send({
      to: user.email,
      subject: 'Order confirmation',
      body: `Your order ${order.id} has been placed.`
    });

    res.json(order);
  }
}
```

**Architectural Violation:**
- **Principle Violated:** Separation of Concerns, Single Responsibility Principle
- **Impact:** Business logic untestable without HTTP framework, cannot reuse logic
- **Dependencies:** Controller directly accesses repositories (skips application layer)
- **Coupling:** Business rules tied to HTTP layer

**Layering Violation:**
```
❌ Current (logic in controller):
Controller (HTTP layer)
  ↓ Contains business logic (validation, calculation, workflow)
  ↓ Directly accesses repositories
Repository (data layer)

Problems:
- Cannot test business logic without Express (Request, Response)
- Cannot reuse logic from CLI, background jobs, tests
- Business rules scattered in multiple controllers
- Hard to change (HTTP concerns mixed with business logic)

✅ Desired (layered):
Controller (HTTP layer)
  ↓ Translates HTTP to application commands
Application Service (use case layer)
  ↓ Orchestrates workflow, business logic
Domain (business logic layer)
  ↓ Enforces invariants, domain rules
Repository (data layer)
```

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (business logic in controller)
export class OrderController {
  async createOrder(req: Request, res: Response) {
    // 100+ lines of validation, calculation, workflow
    // ...
  }
}

// ✅ AFTER (thin controller, logic in service and domain)

// 1. Controller (HTTP layer) - thin, just HTTP concerns
// src/api/controllers/OrderController.ts
export class OrderController {
  constructor(
    private createOrderUseCase: CreateOrderUseCase
  ) {}

  async createOrder(req: Request, res: Response) {
    try {
      // Translate HTTP request to application command
      const command = new CreateOrderCommand({
        userId: req.body.userId,
        items: req.body.items
      });

      // Execute use case (all business logic here)
      const order = await this.createOrderUseCase.execute(command);

      // Translate result to HTTP response
      res.status(201).json({
        id: order.id,
        total: order.total,
        status: order.status
      });

    } catch (error) {
      // Map domain errors to HTTP status codes
      if (error instanceof InvalidOrderError) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof InsufficientStockError) {
        return res.status(400).json({ error: error.message });
      }
      // Unknown error
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

// 2. Application Service (use case layer) - orchestrates workflow
// src/application/usecases/CreateOrderUseCase.ts
export class CreateOrderUseCase {
  constructor(
    private orderRepo: OrderRepository,
    private productRepo: ProductRepository,
    private emailService: EmailService,
    private eventBus: EventBus
  ) {}

  async execute(command: CreateOrderCommand): Promise<Order> {
    // Orchestrate workflow (no HTTP concerns)

    // 1. Validate and load products
    const products = await this.loadAndValidateProducts(command.items);

    // 2. Create order (domain logic)
    const order = Order.create({
      userId: UserId.create(command.userId),
      items: command.items.map(item => OrderItem.create({
        productId: ProductId.create(item.productId),
        quantity: Quantity.create(item.quantity),
        price: Money.create(item.price)
      }))
    });

    // 3. Reserve inventory
    for (const item of command.items) {
      await this.productRepo.reserveStock(item.productId, item.quantity);
    }

    // 4. Save order
    await this.orderRepo.save(order);

    // 5. Publish event (side effects handled asynchronously)
    await this.eventBus.publish(new OrderCreatedEvent(order));

    return order;
  }

  private async loadAndValidateProducts(
    items: CreateOrderItemDTO[]
  ): Promise<Product[]> {
    const products = await Promise.all(
      items.map(item => this.productRepo.findById(item.productId))
    );

    // Validation
    for (let i = 0; i < items.length; i++) {
      const product = products[i];
      const item = items[i];

      if (!product) {
        throw new ProductNotFoundError(item.productId);
      }

      if (product.stock < item.quantity) {
        throw new InsufficientStockError(product.id, item.quantity, product.stock);
      }
    }

    return products;
  }
}

// 3. Domain (business logic layer) - invariants and rules
// src/domain/Order.ts
export class Order {
  private constructor(
    readonly id: OrderId,
    readonly userId: UserId,
    readonly items: OrderItem[],
    readonly total: Money,
    readonly status: OrderStatus
  ) {}

  static create(params: {
    userId: UserId;
    items: OrderItem[];
  }): Order {
    // Domain validation
    if (params.items.length === 0) {
      throw new EmptyOrderError();
    }

    // Calculate total (domain logic)
    const subtotal = params.items.reduce(
      (sum, item) => sum.add(item.totalPrice),
      Money.zero()
    );

    // Apply discount (business rule)
    const total = this.applyDiscount(subtotal);

    const id = OrderId.generate();
    const status = OrderStatus.Pending;

    return new Order(id, params.userId, params.items, total, status);
  }

  private static applyDiscount(subtotal: Money): Money {
    // Business rule: 10% discount for orders over $100
    if (subtotal.greaterThan(Money.create(100))) {
      return subtotal.multiply(0.9);
    }
    return subtotal;
  }

  confirm(): Order {
    if (this.status !== OrderStatus.Pending) {
      throw new InvalidOrderStateError(this.status, 'Cannot confirm non-pending order');
    }

    return new Order(
      this.id,
      this.userId,
      this.items,
      this.total,
      OrderStatus.Confirmed
    );
  }
}

// Value objects (enforce invariants)
export class Quantity {
  private constructor(readonly value: number) {
    if (value < 1) {
      throw new InvalidQuantityError(value);
    }
  }

  static create(value: number): Quantity {
    return new Quantity(value);
  }
}
```

**Why This Fix:**
- **Thin controller**: Only HTTP concerns (request/response translation)
  - Easy to test (mock use case)
  - Can swap Express for Fastify/Koa without changing logic

- **Use case orchestrates**: Coordinates domain objects and infrastructure
  - Testable without HTTP
  - Reusable from CLI, background jobs, tests

- **Domain enforces rules**: Business logic in one place
  - Guaranteed valid state (value objects)
  - Testable with simple unit tests
  - Cannot create invalid orders

**Testing comparison:**
```typescript
// ❌ Before: Must test through HTTP
describe('OrderController', () => {
  it('creates order', async () => {
    const req = { body: { userId: '123', items: [...] } };
    const res = { status: jest.fn(), json: jest.fn() };

    await controller.createOrder(req, res);  // ❌ Tests HTTP + business logic together

    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ✅ After: Test layers separately

// Test controller (just HTTP translation)
describe('OrderController', () => {
  it('returns 201 on successful order', async () => {
    const useCase = mock<CreateOrderUseCase>();
    useCase.execute.mockResolvedValue(order);

    const req = { body: { userId: '123', items: [...] } };
    const res = { status: jest.fn(), json: jest.fn() };

    await controller.createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// Test use case (workflow orchestration)
describe('CreateOrderUseCase', () => {
  it('reserves inventory and saves order', async () => {
    const command = new CreateOrderCommand({ userId: '123', items: [...] });

    const order = await useCase.execute(command);

    expect(productRepo.reserveStock).toHaveBeenCalled();
    expect(orderRepo.save).toHaveBeenCalledWith(order);
  });
});

// Test domain (business rules)
describe('Order', () => {
  it('applies 10% discount for orders over $100', () => {
    const items = [
      OrderItem.create({ price: Money.create(60), quantity: Quantity.create(2) })
      // Total: $120
    ];

    const order = Order.create({ userId, items });

    expect(order.total.value).toBe(108);  // $120 * 0.9 = $108
  });

  it('throws error for empty order', () => {
    expect(() => Order.create({ userId, items: [] }))
      .toThrow(EmptyOrderError);
  });
});
```
```

### Example 4: Leaked Abstraction (Infrastructure Type in API)

```markdown
### AR-4: Database Entity Exposed in API Response [HIGH]

**Evidence:**
**File:** `src/api/controllers/UserController.ts:15`
```typescript
import { User } from '../../entities/User';  // ❌ Database entity

export class UserController {
  constructor(private userRepo: Repository<User>) {}

  async getUser(req: Request, res: Response) {
    const userId = req.params.id;

    // ❌ Returns database entity directly (leaky abstraction)
    const user = await this.userRepo.findOne({ where: { id: userId } });

    // ❌ Exposes internal database structure to API clients
    res.json(user);  // Contains: password_hash, created_at, updated_at, etc.
  }
}
```

**File:** `src/entities/User.ts:8`
```typescript
import { Entity, Column } from 'typeorm';

@Entity('users')
export class User {
  @Column()
  id: string;

  @Column()
  email: string;

  @Column()
  password_hash: string;  // ❌ Exposed to API clients!

  @Column()
  created_at: Date;

  @Column()
  updated_at: Date;
}
```

**Architectural Violation:**
- **Principle Violated:** Information Hiding, Separation of Concerns
- **Impact:** Internal database structure exposed to API clients, cannot change schema
- **Dependencies:** API layer leaks infrastructure types (database entities)
- **Coupling:** API clients coupled to database schema

**Leaky Abstraction:**
```
❌ Current (infrastructure type leaked to API):
Database Schema
    ↓
ORM Entity (with internal fields: password_hash, timestamps)
    ↓
API Response (exposes ALL fields including sensitive ones)
    ↓
API Clients (coupled to database schema)

Problems:
- Cannot change database schema without breaking API
- Exposes sensitive fields (password_hash)
- Exposes implementation details (created_at vs createdAt)
- No versioning (cannot evolve API independently)

✅ Desired (API DTOs hide implementation):
Database Schema
    ↓
ORM Entity (internal)
    ↓ mapped to
API DTO (public contract, only necessary fields)
    ↓
API Response
    ↓
API Clients (coupled to stable API contract, not DB schema)
```

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (exposes database entity)
export class UserController {
  async getUser(req: Request, res: Response) {
    const user = await this.userRepo.findOne({ where: { id: req.params.id } });
    res.json(user);  // ❌ All fields exposed
  }
}

// ✅ AFTER (use DTOs to hide implementation)

// 1. Define API contract (DTO)
// src/api/dto/UserDTO.ts
export class UserDTO {
  id: string;
  email: string;
  name: string;
  createdAt: string;  // ISO 8601 format

  // ❌ NO: password_hash, updated_at, internal fields
}

// 2. Map entity to DTO
// src/api/mappers/UserMapper.ts
export class UserMapper {
  static toDTO(user: User): UserDTO {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.created_at.toISOString()
      // ❌ Explicitly exclude sensitive fields
    };
  }

  static toDTOs(users: User[]): UserDTO[] {
    return users.map(u => this.toDTO(u));
  }
}

// 3. Controller uses DTO
// src/api/controllers/UserController.ts
export class UserController {
  constructor(private userRepo: Repository<User>) {}

  async getUser(req: Request, res: Response) {
    const user = await this.userRepo.findOne({ where: { id: req.params.id } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // ✅ Map to DTO before returning
    const dto = UserMapper.toDTO(user);

    res.json(dto);  // Only public fields
  }

  async listUsers(req: Request, res: Response) {
    const users = await this.userRepo.find();

    // ✅ Map all to DTOs
    const dtos = UserMapper.toDTOs(users);

    res.json(dtos);
  }
}

// Alternative: Use class-transformer
// src/api/dto/UserDTO.ts
import { Expose } from 'class-transformer';

export class UserDTO {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  name: string;

  @Expose({ name: 'created_at' })
  createdAt: Date;

  // All other fields excluded by default
}

// src/api/controllers/UserController.ts
import { plainToInstance } from 'class-transformer';

export class UserController {
  async getUser(req: Request, res: Response) {
    const user = await this.userRepo.findOne({ where: { id: req.params.id } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // ✅ Transform entity to DTO (only @Expose() fields)
    const dto = plainToInstance(UserDTO, user, {
      excludeExtraneousValues: true  // Exclude non-@Expose fields
    });

    res.json(dto);
  }
}
```

**Why This Fix:**
- **API stability**: Can change database schema without breaking API
  - Rename `created_at` to `creation_timestamp` in DB → API unchanged
  - Add new internal fields → API unchanged

- **Security**: Sensitive fields not exposed
  - `password_hash` not leaked
  - `updated_at` not exposed (internal housekeeping)

- **Versioning**: Can evolve API independently
  - API v1: UserDTO with basic fields
  - API v2: UserDTOv2 with additional fields
  - Both can use same database entity

**Example Evolution:**
```typescript
// Database schema change (internal)
// Before:
@Column()
created_at: Date;

// After:
@Column()
creation_timestamp: Date;

// ❌ Without DTOs: API breaks
// Old response: { "created_at": "2024-01-16" }
// New response: { "creation_timestamp": "2024-01-16" }  // ❌ Breaking change!

// ✅ With DTOs: API unchanged
// src/api/mappers/UserMapper.ts
static toDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.creation_timestamp.toISOString()  // ✅ Map to stable API field
  };
}

// API response: { "createdAt": "2024-01-16T..." }  // ✅ No breaking change
```

**Additional Benefits:**
```typescript
// 1. Different DTOs for different contexts
export class UserSummaryDTO {
  id: string;
  name: string;
  // Minimal fields for list view
}

export class UserDetailDTO {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  orders: OrderSummaryDTO[];
  // Full details for detail view
}

// 2. API versioning
export class UserDTOv1 {
  id: string;
  email: string;
}

export class UserDTOv2 {
  id: string;
  email: string;
  name: string;
  avatar: string;  // New field in v2
}

// 3. Validation on input DTOs
export class CreateUserDTO {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsOptional()
  @Length(2, 50)
  name?: string;
}
```
```

### Example 5: Feature Logic Scattered (Low Cohesion)

```markdown
### AR-5: Order Feature Scattered Across 8 Directories [MED]

**Evidence:**
**Directory structure analysis:**
```
src/
  controllers/
    OrderController.ts           # HTTP layer
  services/
    OrderService.ts              # Business logic layer
    PaymentService.ts            # Payment logic (also used by Order)
  validators/
    OrderValidator.ts            # Validation layer
  formatters/
    OrderFormatter.ts            # Presentation layer
  repositories/
    OrderRepository.ts           # Data access layer
  models/
    Order.ts                     # Data model
  dto/
    OrderDTO.ts                  # Data transfer object
  utils/
    OrderUtils.ts                # Utility functions
```

**Architectural Violation:**
- **Principle Violated:** High Cohesion, Feature-based Organization
- **Impact:** Changes to order feature require modifying 8+ different directories
- **Dependencies:** Order logic scattered across layers, hard to find related code
- **Coupling:** Low cohesion (related functionality far apart)

**Cohesion Analysis:**
```
❌ Current (organized by technical layer):
src/
  controllers/        # All controllers
    OrderController.ts
    UserController.ts
    ProductController.ts
  services/           # All services
    OrderService.ts
    UserService.ts
    ProductService.ts
  repositories/       # All repositories
    OrderRepository.ts
    UserRepository.ts
    ProductRepository.ts

To add new order feature:
1. Modify OrderController (src/controllers/)
2. Modify OrderService (src/services/)
3. Add OrderValidator (src/validators/)
4. Update OrderRepository (src/repositories/)
5. Touch 4+ directories, context switching

✅ Desired (organized by feature):
src/
  orders/             # All order-related code together
    OrderController.ts
    OrderService.ts
    OrderValidator.ts
    OrderRepository.ts
    OrderDTO.ts
    Order.ts
    index.ts          # Public exports
  users/              # All user-related code together
    UserController.ts
    UserService.ts
    UserRepository.ts
    ...
  products/           # All product-related code together
    ...

To add new order feature:
1. Work within src/orders/ directory
2. All related code in one place
3. Easy to find, modify, test
```

**Severity:** MED
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (organized by layer - low cohesion)
src/
  controllers/
    OrderController.ts
    UserController.ts
    ProductController.ts
  services/
    OrderService.ts
    UserService.ts
    ProductService.ts
  repositories/
    OrderRepository.ts
    UserRepository.ts
    ProductRepository.ts

// ✅ AFTER (organized by feature - high cohesion)
src/
  orders/
    api/
      OrderController.ts        # HTTP layer
      dto/
        CreateOrderDTO.ts
        OrderDTO.ts
    application/
      OrderService.ts           # Use cases
      OrderValidator.ts
    domain/
      Order.ts                  # Domain model
      OrderItem.ts
      OrderStatus.ts
    infrastructure/
      OrderRepository.ts        # Data access
      OrderMapper.ts
    index.ts                    # Public exports

  users/
    api/
      UserController.ts
      dto/
        CreateUserDTO.ts
        UserDTO.ts
    application/
      UserService.ts
    domain/
      User.ts
    infrastructure/
      UserRepository.ts
    index.ts

  products/
    api/
      ProductController.ts
    application/
      ProductService.ts
    domain/
      Product.ts
    infrastructure/
      ProductRepository.ts
    index.ts

  shared/                       # Only truly shared code
    utils/
      DateUtils.ts              # Generic date functions
      ValidationUtils.ts        # Generic validation
    errors/
      DomainError.ts
      ValidationError.ts

// Public API (exports)
// src/orders/index.ts
export { OrderController } from './api/OrderController';
export { OrderService } from './application/OrderService';
export { OrderDTO, CreateOrderDTO } from './api/dto';
export { OrderId } from './domain/Order';

// ❌ Don't export: OrderRepository, OrderMapper (internal)

// Usage from other modules
// src/users/application/UserService.ts
import { OrderService } from '../../orders';  // ✅ Via public API

// ❌ Don't do this:
// import { OrderRepository } from '../../orders/infrastructure/OrderRepository';
```

**Why This Fix:**
- **High cohesion**: All order code in one place
  - Easy to find (`cd src/orders`)
  - Changes localized (don't touch other dirs)
  - Clear module boundary

- **Feature-based**: Organized by business concept (not technical layer)
  - Aligns with domain model
  - Easy to understand (business features, not technical layers)
  - Can assign feature ownership (team/developer owns `orders/`)

- **Layering still visible**: Each feature has internal layers
  - `api/` - HTTP layer
  - `application/` - Use cases
  - `domain/` - Business logic
  - `infrastructure/` - Data access

**Comparison:**
```
Task: Add "order cancellation" feature

❌ Before (layer-based):
1. Add cancelOrder() to OrderController (src/controllers/)
2. Add cancel logic to OrderService (src/services/)
3. Add validation to OrderValidator (src/validators/)
4. Update OrderRepository (src/repositories/)
5. Modify Order model (src/models/)
6. Context switch between 5+ directories
7. Hard to see full picture (logic scattered)

✅ After (feature-based):
1. Work entirely in src/orders/ directory
2. Add cancelOrder() to OrderController (api/)
3. Add cancel logic to OrderService (application/)
4. Update Order domain model (domain/)
5. All changes in one module
6. Easy to review (all related code together)
7. Can copy orders/ to new project (self-contained)
```

**When to use layer-based vs feature-based:**
```
Layer-based organization (by technical layer):
✅ Good for: Small projects (<10 entities)
✅ Good for: Technical libraries/frameworks
❌ Bad for: Large projects (>20 entities)
❌ Bad for: Domain-rich applications

Feature-based organization (by business feature):
✅ Good for: Medium-large projects (>10 entities)
✅ Good for: Domain-driven design
✅ Good for: Microservices (each feature = potential service)
❌ Requires discipline: Don't let shared/ become dumping ground
```
```

---

## Notes

- **Read full files**: Always read complete files to understand module dependencies
- **Trace imports**: Follow import statements to map dependency graph
- **Check both directions**: What does this import? What imports this?
- **Evidence-first**: Every finding must have file:line + code snippet
- **Actionable remediation**: Provide complete before/after code with architectural improvements
- **Cross-reference CONTEXT**: Check against stated architecture rules (Hexagonal, Clean, etc.)
- **Circular dependencies**: Use tools like `madge` to detect circular imports
- **False positives welcome**: Encourage users to challenge architectural interpretations
