import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogs1748305000000 implements MigrationInterface {
  name = 'AddAuditLogs1748305000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"            uuid        NOT NULL DEFAULT uuid_generate_v4(),
        "correlationId" varchar     NOT NULL,
        "userId"        uuid,
        "method"        varchar(10) NOT NULL,
        "path"          varchar(500) NOT NULL,
        "statusCode"    integer     NOT NULL,
        "durationMs"    integer     NOT NULL,
        "action"        varchar(100),
        "metadata"      jsonb,
        "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_userId" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_correlationId" ON "audit_logs" ("correlationId")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_createdAt"     ON "audit_logs" ("createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_userId"        ON "audit_logs" ("userId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
