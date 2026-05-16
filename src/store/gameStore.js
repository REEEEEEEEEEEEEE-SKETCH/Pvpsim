import { create } from 'zustand';

const LOG_CAP = 50;

export const useGameStore = create((set, get) => ({
  isRunning: false,
  isPaused: false,
  difficulty: 'medium',
  combatLog: [],
  winner: null,

  setRunning: v => set({ isRunning: v }),
  setPaused: v => set({ isPaused: v }),
  setDifficulty: d => set({ difficulty: d }),
  setWinner: w => set({ winner: w }),

  appendLog: (entry, tick) => set(state => {
    const line = tick !== undefined ? `[t${tick}] ${entry}` : entry;
    const next = [...state.combatLog, line];
    if (next.length > LOG_CAP) next.splice(0, next.length - LOG_CAP);
    return { combatLog: next };
  }),

  clearLog: () => set({ combatLog: [] }),

  reset: () =>
    set({ isRunning: false, isPaused: false, combatLog: [], winner: null })
}));
