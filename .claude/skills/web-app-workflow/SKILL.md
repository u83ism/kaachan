---
name: web-app-workflow
description: "End-to-end web application development workflow: specification review → implementation → test generation/execution → documentation update. Use when planning or implementing in Japanese."
---

# Web Application Development Workflow (Japanese)

## Steps

1. **Pre-Planning Preparation**
   - Read `README.md` and the contents of `docs/` to organize specifications and constraints.

2. **Implementation Support**
   - Create an implementation plan and generate code in accordance with the project's coding standards.

3. **Security Review**
   - Verify that input validation is sufficient.
   - Check for missing authorization and authentication controls.
   - Assess risks of SQL injection, XSS, and CSRF.
   - Ensure that no sensitive information is logged.

4. **Testing**
   - Generate tests for the implementation.
   - Execute all tests, including existing ones, and summarize/report the results.

5. **Documentation Consistency**
   - Re-read `README.md` and `docs/`, and propose updates if there are discrepancies between the implementation and the documentation.

## Examples
- “I want to add a new feature, so please support everything from specification review to test generation.”
- “The implementation is complete. Please create and run tests, and align the documentation accordingly.”