import { EventEmitter } from 'events';

export const CHALLENGE_COMPLETED = 'challenge.completed';

export interface ChallengeCompletedPayload {
  userId: string;
  challengeId: string;
  pointsEarned: number;
  listenPercentage: number;
  newTotalPoints: number;
}

class ChallengeEventBus extends EventEmitter {
  async emitAsync(event: string, payload: ChallengeCompletedPayload): Promise<void> {
    const listeners = this.listeners(event) as Array<
      (payload: ChallengeCompletedPayload) => void | Promise<void>
    >;

    await Promise.all(listeners.map((listener) => Promise.resolve(listener(payload))));
  }
}

export const challengeEvents = new ChallengeEventBus();
