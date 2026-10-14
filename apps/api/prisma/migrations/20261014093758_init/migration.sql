CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'AUTHOR', 'REVIEWER');

-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('QUESTION_CREATED', 'QUESTION_UPDATED', 'DUPLICATE_REJECTED', 'DUPLICATE_OVERRIDDEN');

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_grant" (
    "user_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,

    CONSTRAINT "client_grant_pkey" PRIMARY KEY ("user_id","client_id")
);

-- CreateTable
CREATE TABLE "tag_category" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "tag_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "answer_notes" TEXT NOT NULL DEFAULT '',
    "author_id" UUID NOT NULL,
    "client_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_tag" (
    "question_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "question_tag_pkey" PRIMARY KEY ("question_id","tag_id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "type" "AuditType" NOT NULL,
    "actor_id" UUID NOT NULL,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "client_name_key" ON "client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tag_category_slug_key" ON "tag_category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tag_category_id_value_key" ON "tag"("category_id", "value");

-- CreateIndex
CREATE INDEX "question_created_at_id_idx" ON "question"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "question_client_id_idx" ON "question"("client_id");

-- CreateIndex
CREATE INDEX "question_tag_tag_id_question_id_idx" ON "question_tag"("tag_id", "question_id");

-- CreateIndex
CREATE INDEX "audit_event_question_id_at_idx" ON "audit_event"("question_id", "at");

-- CreateIndex
CREATE INDEX "refresh_token_family_id_idx" ON "refresh_token"("family_id");

-- AddForeignKey
ALTER TABLE "client_grant" ADD CONSTRAINT "client_grant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_grant" ADD CONSTRAINT "client_grant_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag" ADD CONSTRAINT "tag_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "tag_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question" ADD CONSTRAINT "question_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tag" ADD CONSTRAINT "question_tag_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tag" ADD CONSTRAINT "question_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (Prisma cannot model these; see ADR-003 spike). The query module must use these exact expressions.
ALTER TABLE "question" ADD CONSTRAINT "question_text_not_blank" CHECK (btrim("text") <> '');

CREATE INDEX "question_search_idx" ON "question" USING GIN (
    (setweight(to_tsvector('english', "text"), 'A') || setweight(to_tsvector('english', "answer_notes"), 'B'))
);

CREATE INDEX "question_text_trgm_idx" ON "question" USING GIN (
    (btrim(regexp_replace(lower("text"), '[^[:alnum:]]+', ' ', 'g'))) gin_trgm_ops
);
