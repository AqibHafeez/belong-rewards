import 'dotenv/config';
import AppDataSource from './config/data-source';
import { Challenge } from './entities/Challenge';
import { Reward } from './entities/Reward';

// ─── seed data (from README) ──────────────────────────────────────────────────

const SEED_CHALLENGES: Omit<Challenge, 'id' | 'createdAt' | 'completions' | 'isActive'>[] = [
  {
    title: 'All Night',
    artist: 'Camo & Krooked',
    description: 'Listen to this drum & bass classic to earn points',
    points: 150,
    durationSeconds: 219,
    difficulty: 'easy',
  },
  {
    title: 'New Forms',
    artist: 'Roni Size',
    description: 'Complete this legendary track for bonus points',
    points: 300,
    durationSeconds: 464,
    difficulty: 'medium',
  },
  {
    title: 'Extended Session',
    artist: 'Camo & Krooked',
    description: 'A longer listening challenge for dedicated fans',
    points: 500,
    durationSeconds: 600,
    difficulty: 'hard',
  },
];

const SEED_REWARDS: Omit<Reward, 'id' | 'createdAt' | 'redemptions' | 'isAvailable'>[] = [
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

// ─── runner ───────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  console.log('🌱 Connecting to database...');
  await AppDataSource.initialize();

  try {
    const challengeRepo = AppDataSource.getRepository(Challenge);
    const rewardRepo     = AppDataSource.getRepository(Reward);

    // Upsert challenges — idempotent: title is unique, so re-running only updates
    await challengeRepo.upsert(
      SEED_CHALLENGES.map((c) => ({ ...c, isActive: true })),
      { conflictPaths: ['title'], skipUpdateIfNoValuesChanged: true },
    );
    console.log(`✅ Seeded ${SEED_CHALLENGES.length} challenges`);

    // Upsert rewards — idempotent: name is unique
    await rewardRepo.upsert(
      SEED_REWARDS.map((r) => ({ ...r, isAvailable: true })),
      { conflictPaths: ['name'], skipUpdateIfNoValuesChanged: true },
    );
    console.log(`✅ Seeded ${SEED_REWARDS.length} rewards`);

    console.log('✅ Seed completed successfully');
  } finally {
    await AppDataSource.destroy();
  }
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
