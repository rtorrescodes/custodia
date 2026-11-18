# Implementation Plan: CUSTODIA

## 1. Tech Stack
- **Framework:** Next.js 15.0 (App Router, Server Components, Server Actions)
- **Language:** TypeScript 5.0 (Strict mode, no `any`)
- **Database:** PostgreSQL 16 via Supabase (Using RLS heavily)
- **ORM:** Prisma 6.0
- **Styling:** Tailwind CSS 3.4
- **Hosting:** Google Cloud Run (Stateless containers)
- **Storage:** Google Cloud Storage (Optimized images before saving)
- **Authentication:** Supabase Auth (MFA for admins)

## 2. Directory Structure
La aplicación estará dividida por dominios (Domain-Driven Structure):
```
src/
  app/              # Next.js routes
  modules/          # Domain Logic
    auth/           # MFA, login logic
    properties/     # Houses, amenities
    owners/         # Portals, approvals
    workorders/     # Maintenance, assignments
    finance/        # Ledger, Multi-currency, Billing
    communications/ # WhatsApp integrations
    integrations/   # Alddea/RAVSIS connectors
  shared/           # UI components, utilities, types
prisma/
  schema.prisma     # Database schema definition
```

## 3. Database Schema (Prisma)
A continuación el esquema preliminar, con énfasis en el aislamiento mediante `tenantId`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ---------------------------------------------------------
// Core & Multi-Tenant Setup
// ---------------------------------------------------------
model Tenant {
  id             String   @id @default(uuid())
  name           String
  countryCode    String   // For localization
  currency       String   // e.g., MXN, USD
  timezone       String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  users          User[]
  properties     Property[]
  workOrders     WorkOrder[]
  transactions   Transaction[]
  integrations   TenantIntegration[]
}

model User {
  id             String   @id @default(uuid())
  tenantId       String
  email          String
  passwordHash   String
  role           UserRole // SUPER_ADMIN, ADMIN, MANAGER, STAFF, VENDOR, OWNER
  mfaEnabled     Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  tenant         Tenant   @relation(fields: [tenantId], references: [id])
  properties     PropertyOwner[]
  assignedTasks  WorkOrder[] @relation("AssignedStaff")

  @@unique([tenantId, email])
}

enum UserRole {
  SUPER_ADMIN
  ADMIN
  MANAGER
  STAFF
  VENDOR
  OWNER
}

// ---------------------------------------------------------
// Properties & Ownership
// ---------------------------------------------------------
model Property {
  id               String   @id @default(uuid())
  tenantId         String
  name             String
  address          String
  fraccionamiento  String?  // Optional relation to Alddea
  alddeaId         String?  // External ID for Alddea integration
  ravsisId         String?  // External ID for RAVSIS integration
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  tenant           Tenant   @relation(fields: [tenantId], references: [id])
  owners           PropertyOwner[]
  workOrders       WorkOrder[]
  transactions     Transaction[]
}

model PropertyOwner {
  propertyId       String
  userId           String
  ownershipShare   Decimal  @default(100.00) // Support for co-ownership

  property         Property @relation(fields: [propertyId], references: [id])
  user             User     @relation(fields: [userId], references: [id])

  @@id([propertyId, userId])
}

// ---------------------------------------------------------
// Work Orders & Maintenance
// ---------------------------------------------------------
model WorkOrder {
  id               String   @id @default(uuid())
  tenantId         String
  propertyId       String
  assignedToId     String?
  title            String
  description      String
  status           WOStatus @default(PENDING)
  estimatedCost    Decimal?
  actualCost       Decimal?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  tenant           Tenant   @relation(fields: [tenantId], references: [id])
  property         Property @relation(fields: [propertyId], references: [id])
  assignedTo       User?    @relation("AssignedStaff", fields: [assignedToId], references: [id])
  evidences        FileEvidence[]
}

enum WOStatus {
  PENDING
  IN_PROGRESS
  AWAITING_APPROVAL
  COMPLETED
  CANCELLED
}

// ---------------------------------------------------------
// Finances & Ledger (Trust Accounting)
// ---------------------------------------------------------
model Transaction {
  id               String   @id @default(uuid())
  tenantId         String
  propertyId       String
  amount           Decimal
  currency         String
  type             TxType   // INCOME, EXPENSE
  category         String
  description      String
  receiptUrl       String?
  createdAt        DateTime @default(now())

  tenant           Tenant   @relation(fields: [tenantId], references: [id])
  property         Property @relation(fields: [propertyId], references: [id])
}

enum TxType {
  INCOME
  EXPENSE
}

// ---------------------------------------------------------
// Integrations & Webhooks
// ---------------------------------------------------------
model TenantIntegration {
  id               String   @id @default(uuid())
  tenantId         String
  provider         String   // ALDDEA, RAVSIS, STRIPE
  isActive         Boolean  @default(false)
  config           Json     // Non-sensitive config
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  tenant           Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, provider])
}

model FileEvidence {
  id               String   @id @default(uuid())
  workOrderId      String
  fileUrl          String
  fileType         String
  createdAt        DateTime @default(now())

  workOrder        WorkOrder @relation(fields: [workOrderId], references: [id])
}
```
