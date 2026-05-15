import { createActorStore } from './actorStore.js';

export const useBotStore = createActorStore({
  levels: {
    attack: 99, strength: 99, defence: 99,
    hitpoints: 99, prayer: 99, ranged: 99, magic: 99
  },
  attackStyle: 'aggressive'
});
