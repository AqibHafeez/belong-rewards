import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBullJobIdToChallengeCompletions1748306000000 implements MigrationInterface {
  name = 'AddBullJobIdToChallengeCompletions1748306000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "challenge_completions"
      ADD COLUMN "bullJobId" varchar
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_challenge_completions_bullJobId"
      ON "challenge_completions" ("bullJobId")
      WHERE "bullJobId" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_challenge_completions_bullJobId"`);
    await queryRunner.query(`ALTER TABLE "challenge_completions" DROP COLUMN IF EXISTS "bullJobId"`);
  }
}
