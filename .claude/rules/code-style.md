## Language & Runtime Environment
- Use TypeScript only
- Runtime environment: Node.js (ESM)
- CommonJS is prohibited unless there is an explicit justification
- Assume strict mode
- The use of `any` is prohibited

---

## Architectural Principles

### 1. Function-Oriented Design

- Prefer pure functions
- Do not use classes unless absolutely necessary
- Shared mutable state is prohibited
- Do not introduce side effects within business logic
- Isolate side effects in boundary layers such as the CLI layer

### 2. Scope Discipline

- Minimize variable scope
- Prefer `const`
- Do not reassign unless necessary
- Break logic into small functions

### 3. State Management

- Global state is prohibited
- Module-level mutable state is prohibited
- Pass data via function arguments and return values

### 4. CLI Structure

Responsibilities of the entry point:
- Argument parsing
- Input/output handling
- Process termination handling

Core logic must remain pure and testable.

---

## Coding Conventions

- Exported functions must have explicit return types
- Use `readonly` wherever possible
- Prefer union types over enums
- Implicit `any` is prohibited
- Use discriminated unions for branching

---

## Error Handling

- Do not throw exceptions in core logic
- Represent errors using return-value types such as `Result`
- Only the boundary layer (CLI layer) may throw exceptions

---

## Guidelines for Code Generation

- Keep functions small
- Avoid deeply nested imperative blocks
- Prefer composition over excessive control structures
- Avoid unnecessary abstractions and over-engineering

---

## Strict Constraints

- Do not introduce external libraries without valid justification
- Do not introduce frameworks
- Do not use DI containers
- Do not use decorators
- Do not adopt OOP patterns unless explicitly required
- Do not implement based on uncertain specifications; verify ambiguous points against official documentation