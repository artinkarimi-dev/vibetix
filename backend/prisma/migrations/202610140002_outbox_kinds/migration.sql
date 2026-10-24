DROP INDEX "OutboxJob_orderId_key";
CREATE UNIQUE INDEX "OutboxJob_orderId_kind_key" ON "OutboxJob"("orderId",kind);
ALTER TABLE "User" ADD CONSTRAINT normalized_email CHECK (email = lower(email));
