ALTER TABLE "Session" ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Session" ADD COLUMN "mfaVerifiedAt" TIMESTAMP(3);
CREATE TABLE "AuditLog" (
  id TEXT PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  metadata JSONB NOT NULL,
  ip TEXT NOT NULL,
  "userAgent" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId","createdAt");
CREATE INDEX "AuditLog_resource_resourceId_createdAt_idx" ON "AuditLog"(resource,"resourceId","createdAt");
