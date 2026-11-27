-- CreateTable
CREATE TABLE "staff_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitations_token_hash_key" ON "staff_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "idx_staff_invitations_email" ON "staff_invitations"("email");

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
