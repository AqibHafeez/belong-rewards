import 'dotenv/config';
import bcrypt from 'bcrypt';
import AppDataSource from './config/data-source';
import { Challenge } from './entities/Challenge';
import { Reward } from './entities/Reward';
import { User } from './entities/User';
import { ChallengeCompletion } from './entities/ChallengeCompletion';
import { config } from './config';

const SEED_CHALLENGES = [
  {
    title: 'All Night',
    artist: 'Camo & Krooked',
    description: 'Listen to this drum & bass classic to earn points',
    points: 150,
    durationSeconds: 219,
    difficulty: 'easy' as const,
  },
  {
    title: 'New Forms',
    artist: 'Roni Size',
    description: 'Complete this legendary track for bonus points',
    points: 300,
    durationSeconds: 464,
    difficulty: 'medium' as const,
  },
  {
    title: 'Extended Session',
    artist: 'Camo & Krooked',
    description: 'A longer listening challenge for dedicated fans',
    points: 500,
    durationSeconds: 600,
    difficulty: 'hard' as const,
  },
];

const SEED_REWARDS = [
  {
    name: 'Early Access Pass',
    description: 'Get early access to new features',
    pointsCost: 200,
  },
  {
    name: 'Exclusive Playlist',
    description: 'Unlock a curated artist playlist',
    pointsCost: 500,
  },
  {
    name: 'VIP Fan Badge',
    description: 'Show off your dedication with a VIP badge',
    pointsCost: 1000,
  },
  {
    name: 'Concert Ticket Raffle',
    description: 'Enter a raffle for concert tickets',
    pointsCost: 2500,
  },
];

// Demo users — pre-seeded so reviewers can test without registering
// Password for all: Test@1234
const DEMO_USERS = [
  { email: 'alice@belong.com',   displayName: 'Alice',   completions: [0, 1, 2] }, // all 3 challenges
  { email: 'bob@belong.com',     displayName: 'Bob',     completions: [0, 1] },    // easy + medium
  { email: 'charlie@belong.com', displayName: 'Charlie', completions: [0] },       // easy only
  { email: 'test@belong.com',    displayName: 'Test Fan', completions: [] },        // reviewer login
];
const DEMO_PASSWORD = 'Test@1234';
const DEMO_LISTEN_PCT = 100; // full points for demo


function log(msg: string) {
  console.log(msg);
}

async function seed(): Promise<void> {
  log('Connecting to database...ZzZzZ');
  await AppDataSource.initialize();

  try {
    await AppDataSource.transaction(async (manager) => {
      // ── 1. Challenges ────────────────────────────────────────────────────────
      const challengeRepo = manager.getRepository(Challenge);
      const { raw: challengeRaw } = await challengeRepo.upsert(
        SEED_CHALLENGES.map((c) => ({ ...c, isActive: true })),
        { conflictPaths: ['title'], skipUpdateIfNoValuesChanged: true },
      );
      const insertedChallenges = (challengeRaw as { id: string }[]).length;
      log(` Challenges  — ${insertedChallenges} upserted (${SEED_CHALLENGES.length} total)`);

      // Reload challenges so we have their IDs
      const challenges = await challengeRepo.find();
      const challengeByIndex = SEED_CHALLENGES.map((sc) =>
        challenges.find((c) => c.title === sc.title)!,
      );

      // ── 2. Rewards ───────────────────────────────────────────────────────────
      const rewardRepo = manager.getRepository(Reward);
      await rewardRepo.upsert(
        SEED_REWARDS.map((r) => ({ ...r, isAvailable: true })),
        { conflictPaths: ['name'], skipUpdateIfNoValuesChanged: true },
      );
      log(`Rewards     — ${SEED_REWARDS.length} upserted`);

      const userRepo       = manager.getRepository(User);
      const completionRepo = manager.getRepository(ChallengeCompletion);
      const passwordHash   = await bcrypt.hash(DEMO_PASSWORD, config.auth.bcryptRounds);

      let usersCreated = 0;
      let completionsCreated = 0;

      for (const demo of DEMO_USERS) {
        // Idempotent: skip if user already exists
        const existing = await userRepo.findOne({ where: { email: demo.email } });
        if (existing) {
          log(`User ${demo.email} already exists — skipping`);
          continue;
        }

        const totalPoints = demo.completions.reduce((sum, idx) => {
          return sum + challengeByIndex[idx].points;
        }, 0);

        const user = await userRepo.save(
          userRepo.create({
            email: demo.email,
            passwordHash,
            displayName: demo.displayName,
            totalPoints,
          }),
        );
        usersCreated++;

        // Seed completions for this user
        for (const idx of demo.completions) {
          const challenge = challengeByIndex[idx];
          await completionRepo.save(
            completionRepo.create({
              userId: user.id,
              challengeId: challenge.id,
              pointsEarned: challenge.points,
              listenPercentage: DEMO_LISTEN_PCT,
            }),
          );
          completionsCreated++;
        }
      }

      log(` Users       — ${usersCreated} created, ${DEMO_USERS.length - usersCreated} skipped`);
      log(` Completions — ${completionsCreated} created`);
    });

    log('\n   Seed completed successfully');
    log(`\n   Demo credentials  (password: ${DEMO_PASSWORD})`);
    DEMO_USERS.forEach((u) => log(`   · ${u.email}`));
  } finally {
    await AppDataSource.destroy();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
