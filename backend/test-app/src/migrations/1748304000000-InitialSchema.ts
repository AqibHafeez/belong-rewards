import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1748304000000 implements MigrationInterface {
  name = 'InitialSchema1748304000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // users
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                   uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "email"                varchar     NOT NULL,
        "passwordHash"         varchar     NOT NULL,
        "displayName"          varchar,
        "totalPoints"          integer     NOT NULL DEFAULT 0,
        "failedLoginAttempts"  integer     NOT NULL DEFAULT 0,
        "lockedUntil"          TIMESTAMPTZ,
        "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email"       ON "users" ("email")`);
    await queryRunner.query(`CREATE        INDEX "IDX_users_totalPoints" ON "users" ("totalPoints" DESC)`);

    // challenges
    await queryRunner.query(`CREATE TYPE "challenges_difficulty_enum" AS ENUM ('easy', 'medium', 'hard')`);
    await queryRunner.query(`
      CREATE TABLE "challenges" (
        "id"              uuid                         NOT NULL DEFAULT uuid_generate_v4(),
        "title"           varchar                      NOT NULL,
        "artist"          varchar                      NOT NULL,
        "description"     text                         NOT NULL,
        "points"          integer                      NOT NULL,
        "durationSeconds" integer                      NOT NULL,
        "difficulty"      "challenges_difficulty_enum" NOT NULL,
        "isActive"        boolean                      NOT NULL DEFAULT true,
        "createdAt"       TIMESTAMPTZ                  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_challenges" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_challenges_title"              ON "challenges" ("title")`);
    await queryRunner.query(`CREATE        INDEX "IDX_challenges_isActive_difficulty" ON "challenges" ("isActive", "difficulty")`);

    // challenge_completions
    await queryRunner.query(`
      CREATE TABLE "challenge_completions" (
        "id"                uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "userId"            uuid         NOT NULL,
        "challengeId"       uuid         NOT NULL,
        "pointsEarned"      integer      NOT NULL,
        "listenPercentage"  decimal(5,2) NOT NULL,
        "completedAt"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_challenge_completions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cc_user"      FOREIGN KEY ("userId")      REFERENCES "users"("id")      ON DELETE CASCADE,
        CONSTRAINT "FK_cc_challenge" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_cc_userId_completedAt" ON "challenge_completions" ("userId", "completedAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_cc_challengeId"        ON "challenge_completions" ("challengeId")`);

    // rewards
    await queryRunner.query(`
      CREATE TABLE "rewards" (
        "id"          uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "name"        varchar     NOT NULL,
        "description" text        NOT NULL,
        "pointsCost"  integer     NOT NULL,
        "isAvailable" boolean     NOT NULL DEFAULT true,
        "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_rewards" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_rewards_name"        ON "rewards" ("name")`);
    await queryRunner.query(`CREATE        INDEX "IDX_rewards_isAvailable" ON "rewards" ("isAvailable")`);

    // reward_redemptions
    await queryRunner.query(`CREATE TYPE "reward_redemptions_status_enum" AS ENUM ('pending', 'fulfilled', 'cancelled')`);
    await queryRunner.query(`
      CREATE TABLE "reward_redemptions" (
        "id"          uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "userId"      uuid                              NOT NULL,
        "rewardId"    uuid                              NOT NULL,
        "pointsSpent" integer                           NOT NULL,
        "status"      "reward_redemptions_status_enum"  NOT NULL DEFAULT 'pending',
        "redeemedAt"  TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reward_redemptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rr_user"   FOREIGN KEY ("userId")   REFERENCES "users"("id")   ON DELETE CASCADE,
        CONSTRAINT "FK_rr_reward" FOREIGN KEY ("rewardId") REFERENCES "rewards"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_rr_userId_redeemedAt" ON "reward_redemptions" ("userId", "redeemedAt")`);

    // refresh_tokens
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"        uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "userId"    uuid        NOT NULL,
        "tokenHash" varchar     NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "revokedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rt_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_refresh_tokens_tokenHash" ON "refresh_tokens" ("tokenHash")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reward_redemptions"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "reward_redemptions_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rewards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "challenge_completions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "challenges"`);
    await queryRunner.query(`DROP TYPE  IF EXISTS "challenges_difficulty_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
