CREATE TYPE "NotificationType" AS ENUM ('QUESTION_APPROVED', 'QUESTION_REJECTED');

CREATE TABLE "notification" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "question_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "read_at" TIMESTAMPTZ,
  CONSTRAINT "notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "notification_user_id_created_at_idx" ON "notification"("user_id", "created_at" DESC);
