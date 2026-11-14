# Pollify – Future Improvement: System Administrator & Device Certificate Management

**Status:** Deferred – Not part of the current development phase  
**Priority:** Future Improvement  
**Project:** Pollify – Offline Classroom Polling System

## 1. Objective

Implement a dedicated System Administrator module for Pollify to manage instructor accounts, register physical devices, issue and manage device certificates, and monitor administrative activities.

This improvement must be implemented only after the core Instructor and Student modules are completed, tested, and stable.

**Important:** Do not implement this feature during the current development phase. This document is a saved specification for future development.

## 2. Existing System Requirements to Preserve

When implementing this improvement:

- Pollify must remain a LAN-only application that works without an internet connection.
- The existing Instructor module and Student participation workflow must continue working.
- Instructors must retain their existing accounts and authentication.
- Students must remain accountless. They must not be given student login or registration accounts.
- Students must continue joining activities using their full name and activity session code.
- Existing classroom activities, questions, responses, results, and database relationships must remain intact.
- Do not remove, weaken, or bypass existing authentication, authorization, validation, encryption, or security controls.
- Do not give System Administrators access to instructor classroom results, student submissions, or confidential activity data simply because they have administrative privileges.

Before making changes, inspect the existing project structure, database schema, authentication system, and security implementation. Reuse existing patterns where appropriate.

## 3. System Administrator Account and Dashboard

Create a dedicated System Administrator role with its own authenticated dashboard.

The administrator dashboard should provide:

- Overview of registered instructors.
- Overview of enrolled student and instructor devices.
- Active, revoked, and expired device certificates.
- Recently issued certificates.
- Certificates approaching expiration.
- Recent administrative activities.
- Quick access to instructor management and device certificate management.

Only authorized System Administrators may access these functions.

## 4. Instructor Account Management

System Administrators should be able to:

- View registered instructor accounts.
- Search and filter instructors.
- View instructor account status.
- Activate or deactivate instructor accounts.
- Reset instructor passwords.
- Require an instructor to change their password upon their next login.
- Monitor relevant account activity.

Security requirements:

- Administrators must never be able to view existing instructor passwords.
- Password resets must use a secure temporary credential or password-reset process.
- Temporary credentials must not become permanent passwords automatically.
- Administrative password resets and account status changes must be recorded in the audit log.
- Deactivated instructors must not be able to authenticate or access protected instructor functions.

Administrators must not be able to view or modify instructors' classroom results or student submissions.

## 5. Physical Device Registration and Enrollment

Device enrollment must be conducted through a face-to-face, school-based registration process.

The intended workflow is:

1. A student or instructor personally visits the System Administrator.
2. The administrator verifies the person's identity using their official school-issued ID.
3. The administrator verifies the physical device that will be registered.
4. The administrator selects the person's category: Student or Instructor.
5. The administrator enters the person's actual school-issued ID.
6. The administrator registers the device.
7. Pollify generates a unique device certificate.
8. The administrator provides the certificate installation package.
9. The person installs the certificate on their device.
10. The device can then authenticate when accessing Pollify over the LAN.

Students must not need a Pollify account. Their school-issued ID is used for device enrollment and administrative identification, not as a student login credential.

One person may register multiple devices. Each registered device must receive its own unique certificate.

Support different device types and operating systems, including:

- Android phones and tablets.
- iPhones and iPads.
- Windows laptops and desktops.
- macOS computers.
- Other supported devices and browsers.

Do not design the implementation exclusively for mobile phones.

## 6. Device Certificate Identification

Use the following certificate display identifier format:

`POLLIFY-<SCHOOL_ID>-<NUMBER>`

Examples:

- `POLLIFY-7241243-001`
- `POLLIFY-7240434-002`

Rules:

- The administrator must enter the actual school-issued ID.
- The school ID must not be hardcoded or generated using placeholder values.
- The category (Student or Instructor) must be stored separately in the database.
- Each physical device must have its own certificate identifier.
- A person registering another device must receive another certificate identifier.

### Certificate Number Allocation

The three-digit suffix represents a reusable display number.

- Allocate the lowest available number for a given school-issued ID.
- Do not allocate a number that is currently assigned to an active certificate.
- If a certificate is revoked, its display number becomes available for reuse.
- Preserve the revoked certificate's historical record permanently.
- Reuse of a display number must never mean reuse of the actual cryptographic certificate serial number.

Example:

| Event | Display identifier | Cryptographic serial |
|---|---|---|
| Janice receives a certificate | POLLIFY-7241243-001 | A10001 |
| Janice's certificate is revoked | POLLIFY-7241243-001 | A10001 |
| Gab receives the next available number | POLLIFY-7240434-001 | A10002 |

The example demonstrates that display numbers may be reused, but cryptographic serial numbers must never be reused.

### Concurrency and Database Safety

Number allocation must be atomic and concurrency-safe.

Use appropriate MySQL transactions, locking, and unique constraints to prevent two administrators from issuing certificates with the same active display number.

Historical certificate records must remain intact even when a display number is reused.

## 7. Device Certificate Issuance and Management

The System Administrator must be able to:

- Issue a certificate for a registered device.
- View certificate details.
- Search certificates by school-issued ID, certificate identifier, device, category, status, or serial number.
- View certificate issuance and expiration dates.
- Monitor certificate status.
- Revoke a certificate.
- Record the reason for revocation.
- View certificate history.
- Issue a replacement certificate for a previously revoked or expired device.

Each certificate must be unique to its registered device.

### Certificate Security

Use proper X.509 client certificates and a dedicated Client Certificate Authority.

Do not reuse the existing mkcert development CA as the Client Certificate Authority.

The system must:

- Keep the Client CA private key securely stored and inaccessible to ordinary users.
- Never expose the CA private key through the browser or administrator dashboard.
- Generate unique cryptographic serial numbers.
- Never reuse a cryptographic serial number, including after revocation or expiration.
- Store certificate fingerprints and relevant certificate metadata.
- Verify certificate validity and revocation status during device authentication.
- Reject revoked and expired certificates.
- Protect certificate issuance and private-key handling.
- Avoid trusting client identity information supplied through ordinary HTTP headers.

Device certificates establish possession of an enrolled device credential. They do not replace instructor account authentication or prove a person's identity by themselves.

## 8. Certificate Validity – Five Years

Every newly issued device certificate must have a default validity period of **five years (60 months)** from its issuance date.

Requirements:

- Encode the five-year validity period in the actual X.509 certificate.
- Set the certificate's `notBefore` and `notAfter` values correctly.
- Store the issuance date and expiration date in the database.
- Calculate expiration dates correctly, including leap-year cases.
- Use the server's trusted system clock.
- Reject certificates that have expired.
- Display expiration dates and certificate status in the administrator dashboard.
- Allow administrators to revoke a certificate before its expiration.
- Allow replacement certificates to be issued with a new cryptographic serial number and a new five-year validity period.

A certificate's five-year validity does not prevent an administrator from revoking it earlier.

## 9. Certificate Installation and Device Compatibility

Provide an understandable certificate installation process for students and instructors.

The administrator should be able to generate or retrieve the appropriate device certificate installation package.

The installation process must account for differences among supported operating systems and browsers.

Security requirements:

- Never distribute the Client CA private key.
- Never expose another device's private key.
- Protect certificate packages during generation, transfer, and installation.
- Provide clear instructions for installing and removing certificates.
- Make it clear when a certificate has been installed successfully.
- Explain what happens when a certificate expires or is revoked.

Do not assume every browser or operating system handles client certificate selection identically. Test compatibility before declaring a platform supported.

## 10. Certificate Authentication and LAN Access

Integrate device certificate authentication into Pollify's existing HTTPS architecture.

The intended security model is:

- A registered device presents its client certificate when connecting.
- Pollify verifies the certificate against the dedicated Client CA.
- Pollify checks the certificate's validity and revocation status.
- Unregistered, invalid, revoked, and expired device certificates must not be accepted.
- Instructor access must still require the instructor's existing account authentication.
- Student access must remain accountless and continue using full name and activity session code.

Plan the initial device-enrollment and administrator-access process carefully.

A strict mutual TLS requirement can prevent first-time devices from reaching the application. Therefore, design a secure bootstrap process that allows the authorized administrator to enroll devices without introducing an insecure public enrollment route.

Do not implement certificate authentication by simply trusting a certificate identifier submitted by the client.

## 11. Administrative Audit Logs

Record important administrative actions, including:

- Instructor account activation and deactivation.
- Instructor password resets.
- Forced password-change actions.
- Device registration.
- Certificate issuance.
- Certificate revocation.
- Certificate replacement.
- Changes to device enrollment information.

Each audit record should include, where applicable:

- Administrator account responsible for the action.
- Action performed.
- Affected instructor or device.
- Date and time.
- Relevant certificate identifier.
- Reason or description.
- Outcome of the operation.

Audit logs must be protected against unauthorized modification or deletion.

Do not record passwords, private keys, or other sensitive credentials in audit logs.

## 12. Database and Migration Requirements

Inspect the existing Prisma schema before designing new tables.

Create only the additional models and relationships necessary for:

- System Administrator accounts and roles.
- Device registrations.
- Device certificate records.
- Certificate revocation history.
- Certificate display-number allocation.
- Administrative audit logs.

Preserve existing instructor, classroom, activity, question, and response relationships.

Use proper foreign keys, unique constraints, indexes, and appropriate deletion behavior.

Historical certificate records must not be deleted simply because a device is revoked or a display number is reused.

All schema changes must use proper Prisma migrations. Do not modify the production database manually to bypass migration history.

## 13. User Interface Requirements

Follow Pollify's existing design system and visual style.

The new administrator interface must be:

- Responsive across phones, tablets, laptops, and desktops.
- Consistent with the existing Pollify interface.
- Accessible and usable with keyboard and touch input.
- Clear about certificate status and expiration.
- Equipped with confirmation dialogs for sensitive actions.
- Designed to prevent accidental revocation or account deactivation.
- Free of unnecessary visual complexity.

Use Lucide icons where icons are needed. Do not introduce emoji icons into the application.

## 14. Testing and Security Verification

Before considering this improvement complete, test:

**Administrator security**
- Only authorized administrators can access administrative functions.
- Instructors and students cannot access administrator routes or APIs.
- Administrators cannot access instructor results or student submissions.

**Instructor management**
- Activation and deactivation work correctly.
- Password resets are secure.
- Forced password changes work correctly.
- Existing instructor authentication remains functional.

**Device enrollment**
- Student and instructor devices can be registered.
- Multiple devices can be assigned to one person.
- School-issued IDs are stored correctly.
- Invalid or duplicate registrations are handled safely.

**Certificate management**
- Certificates are unique.
- Display-number reuse follows the lowest-vacant-number rule.
- Cryptographic serial numbers are never reused.
- Revoked certificates remain in history.
- Expired certificates are rejected.
- Replacement certificates work correctly.
- Five-year validity is correctly encoded in the X.509 certificate.

**Concurrency**
- Simultaneous certificate issuance cannot allocate the same active display number.
- Database transactions remain consistent after failures.

**Compatibility**
- Test supported Android, iOS, Windows, macOS, tablet, and browser combinations.
- Verify certificate installation and client certificate authentication.
- Test LAN-only operation without internet access.

**Regression**
- Existing instructor login and dashboard continue working.
- Existing student joining workflow continues working.
- Classroom activities and responses remain intact.
- Existing security controls remain enforced.

## 15. Implementation Instructions for the Future Coding Assistant

When this improvement is eventually started:

1. Inspect the current Pollify repository and its latest implementation.
2. Read this document completely.
3. Review the current Prisma schema, authentication, authorization, HTTPS server, API routes, and UI components.
4. Identify the smallest safe implementation plan.
5. Present the implementation phases before changing code.
6. Implement one phase at a time.
7. Preserve all existing working functionality.
8. Add and run appropriate database migrations.
9. Add tests for new functionality and regression tests for existing functionality.
10. Run the production build and resolve all errors.
11. Test the complete workflow on the LAN without internet access.

Do not assume the project still has the same code structure or dependencies when this improvement begins. Inspect the repository first.

**Final priority:** Complete and stabilize the existing Instructor and Student modules before implementing this entire System Administrator and Device Certificate Management feature.

## 16. Developer Responsibilities and Expected Deliverables

The future developer or coding assistant is responsible for delivering a complete, working, secure, and tested System Administrator and Device Certificate Management module.

Do not treat this task as a UI-only implementation. The work must cover the frontend, backend, database, authentication, authorization, certificate infrastructure, security, testing, and documentation.

### A. Initial Repository Assessment

Before modifying anything, the developer must:

1. Inspect the entire existing Pollify project structure.
2. Review the current Prisma schema and database relationships.
3. Review existing instructor authentication, sessions, roles, and authorization.
4. Review the current HTTPS server configuration.
5. Review existing API routes, middleware, validation, and security controls.
6. Identify which existing components and services can be reused.
7. Identify potential conflicts between the new features and existing functionality.
8. Prepare a development plan with clear implementation phases.

The developer must not blindly replace existing files or redesign working modules.

### B. Implementation and Development

The developer must implement the following as integrated functionality:

1. System Administrator authentication and role-based access control.
2. Administrator dashboard and navigation.
3. Instructor account management.
4. Physical student and instructor device registration.
5. Device certificate generation and issuance.
6. Certificate installation package generation and secure handling.
7. Certificate revocation, expiration monitoring, and replacement.
8. Five-year X.509 certificate validity.
9. Lowest-vacant display-number allocation with concurrency protection.
10. Dedicated Client Certificate Authority integration.
11. Secure device authentication through HTTPS and mutual TLS.
12. Secure initial administrator and device enrollment procedures.
13. Administrative audit logging.
14. Database models, relationships, migrations, and indexes.
15. Responsive administrator interfaces for supported devices.

All functionality must be connected to the actual backend and database. Do not use mock data, hardcoded certificate records, or frontend-only simulations as substitutes for working features.

### C. Security Responsibilities

The developer must:

- Apply server-side authorization to every protected administrator operation.
- Prevent instructors and students from accessing administrator-only resources.
- Keep the Client CA private key outside browser-accessible files and ordinary application responses.
- Protect generated device private keys and certificate packages.
- Never reuse cryptographic serial numbers.
- Ensure revoked and expired certificates are rejected.
- Prevent unauthorized certificate issuance and revocation.
- Validate all user input on the server.
- Protect sensitive administrative operations against CSRF, unauthorized requests, and privilege escalation as applicable to the existing architecture.
- Avoid exposing secrets, passwords, private keys, or sensitive certificate material in logs.
- Ensure that certificate authentication cannot be bypassed through spoofed request headers.
- Provide safe error handling without revealing internal server details.

The developer must also document any security limitations or platform-specific restrictions discovered during implementation.

### D. Testing Responsibilities

The developer must create and execute appropriate tests for:

- Administrator login and authorization.
- Instructor account management.
- Student and instructor device enrollment.
- Certificate generation and installation workflows.
- Certificate expiration and revocation.
- Certificate replacement.
- Five-year certificate validity.
- Display-number allocation and reuse.
- Concurrent certificate issuance.
- Audit log creation and protection.
- Unauthorized access attempts.
- LAN-only operation without internet access.
- Regression of existing instructor and student workflows.

Do not declare a feature complete simply because the page loads or the production build succeeds.

### E. Documentation Responsibilities

Provide updated documentation covering:

1. System Administrator setup and initial account creation.
2. Administrator dashboard usage.
3. Instructor account management procedures.
4. Face-to-face student and instructor device enrollment.
5. Certificate generation and issuance.
6. Certificate installation instructions for supported operating systems.
7. Certificate revocation and replacement.
8. Certificate expiration and renewal procedures.
9. Client CA private-key protection and backup procedures.
10. HTTPS and mutual TLS configuration.
11. Database migrations and deployment requirements.
12. Troubleshooting common certificate and device authentication problems.

Documentation must use beginner-friendly language and include step-by-step instructions where appropriate.

### F. Required Final Deliverables

Before marking the future improvement complete, provide:

- Fully implemented System Administrator module.
- Working instructor account management.
- Working student and instructor device enrollment.
- Working device certificate issuance and management.
- Secure Client CA and mutual TLS integration.
- Updated Prisma schema and successful database migrations.
- Automated tests and their results.
- Successful production build.
- LAN testing results without internet access.
- Updated technical and user documentation.
- A summary of all changed, added, and removed files.
- A list of any known limitations or remaining issues.

### G. Development Completion Report

At the end of the implementation, provide a final report containing:

- Features completed.
- Features not completed and why.
- Database changes.
- Security measures implemented.
- Tests performed and their results.
- Build status.
- LAN compatibility results.
- Known bugs or limitations.
- Instructions for deploying and using the new module.

Do not claim successful implementation or testing unless the corresponding work was actually performed and verified.

### H. Final Acceptance Criteria

The future improvement is considered complete only when:

- The System Administrator can securely manage instructor accounts.
- The administrator can register student and instructor devices in person.
- Each registered device can receive its own unique certificate.
- Display-number reuse follows the agreed lowest-vacant-number rule.
- Cryptographic serial numbers are permanently unique.
- Certificates have an actual five-year X.509 validity period.
- Revoked and expired certificates cannot authenticate.
- The system supports the agreed device and browser compatibility requirements.
- Administrative actions are recorded in audit logs.
- Pollify continues operating on the LAN without requiring internet access.
- Existing instructor and student functionality remains operational.
- All critical tests pass and the production build succeeds.

**Important development rule:** Work in small, verifiable phases. Do not attempt to implement the entire module in one uncontrolled code change. Preserve existing functionality, report progress clearly, and wait for verification before proceeding to the next major phase.