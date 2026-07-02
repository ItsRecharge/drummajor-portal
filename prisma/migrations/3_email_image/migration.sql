-- Inline images embedded in announcement emails, served at /i/[id].
CREATE TABLE "EmailImage" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailImage_pkey" PRIMARY KEY ("id")
);
