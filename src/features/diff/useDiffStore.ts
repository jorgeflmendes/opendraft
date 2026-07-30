import { create } from "zustand";

interface DiffState {
  open: boolean;
  openDiff: () => void;
  closeDiff: () => void;
  toggleDiff: () => void;
}

export const useDiffStore = create<DiffState>((set, get) => ({
  open: false,
  openDiff: () => set({ open: true }),
  closeDiff: () => set({ open: false }),
  toggleDiff: () => set({ open: !get().open }),
}));
