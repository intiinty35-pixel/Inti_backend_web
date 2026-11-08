CREATE INDEX "billing_audit_createdAt_id_idx" ON "billing_audit"("createdAt", "id");
CREATE INDEX "billing_audit_action_createdAt_idx" ON "billing_audit"("action", "createdAt");
