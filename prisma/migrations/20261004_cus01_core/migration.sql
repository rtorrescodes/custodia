-- CreateEnum
CREATE TYPE "OperatingMode" AS ENUM ('LANDLORD', 'PROPERTY_MANAGER');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('PM_ADMIN', 'PM_STAFF', 'LANDLORD', 'OWNER', 'RENTER', 'VENDOR');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ManagementType" AS ENUM ('OWNED', 'THIRD_PARTY', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "FundCustodian" AS ENUM ('LANDLORD', 'PM_ESCROW', 'DIRECT_OWNER', 'UNDETERMINED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "operatingMode" "OperatingMode" NOT NULL DEFAULT 'LANDLORD';

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "portfolioId" TEXT;
ALTER TABLE "Property" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Property" ADD COLUMN "isUnit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Property" ADD COLUMN "unitNumber" TEXT;
ALTER TABLE "Property" ADD COLUMN "managementType" "ManagementType" NOT NULL DEFAULT 'PENDING_REVIEW';
ALTER TABLE "Property" ADD COLUMN "fundCustodian" "FundCustodian" NOT NULL DEFAULT 'UNDETERMINED';
ALTER TABLE "Property" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TenantMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'PM_ADMIN',
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPortfolioAccess" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,

    CONSTRAINT "MemberPortfolioAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantMember_tenantId_userId_key" ON "TenantMember"("tenantId", "userId");
CREATE INDEX "TenantMember_tenantId_status_idx" ON "TenantMember"("tenantId", "status");
CREATE INDEX "TenantMember_userId_idx" ON "TenantMember"("userId");

-- CreateIndex
CREATE INDEX "Portfolio_tenantId_idx" ON "Portfolio"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberPortfolioAccess_memberId_portfolioId_key" ON "MemberPortfolioAccess"("memberId", "portfolioId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvitation_tokenHash_key" ON "TenantInvitation"("tokenHash");
CREATE INDEX "TenantInvitation_tenantId_email_idx" ON "TenantInvitation"("tenantId", "email");
CREATE INDEX "TenantInvitation_tokenHash_idx" ON "TenantInvitation"("tokenHash");

-- AddForeignKey
ALTER TABLE "TenantMember" ADD CONSTRAINT "TenantMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantMember" ADD CONSTRAINT "TenantMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberPortfolioAccess" ADD CONSTRAINT "MemberPortfolioAccess_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TenantMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberPortfolioAccess" ADD CONSTRAINT "MemberPortfolioAccess_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantInvitation" ADD CONSTRAINT "TenantInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantInvitation" ADD CONSTRAINT "TenantInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Property" ADD CONSTRAINT "Property_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
