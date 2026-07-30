import { create } from "zustand";
import type { PdfRect } from "@/services/synctex";

// Request counters preserve repeated navigation to the same source/PDF location;
// value equality alone would cause consumers to suppress the second request.

interface SyncState {
  highlights: PdfRect[];
  jumpToPage: number | null;
  forwardRequestId: number;

  reverseTarget: { path: string; line: number; requestId: number } | null;

  forward: (rects: PdfRect[]) => void;
  reverse: (path: string, line: number) => void;
  clearReverse: () => void;
  reset: () => void;
}

let forwardSeq = 0;
let reverseSeq = 0;

export const useSyncStore = create<SyncState>((set) => ({
  highlights: [],
  jumpToPage: null,
  forwardRequestId: 0,
  reverseTarget: null,
  forward: (rects) => {
    if (rects.length === 0) {
      set({ highlights: [], jumpToPage: null });
      return;
    }
    forwardSeq += 1;
    const firstPage = rects[0]!.page;
    set({
      highlights: rects,
      jumpToPage: firstPage,
      forwardRequestId: forwardSeq,
    });
  },
  reverse: (path, line) => {
    reverseSeq += 1;
    set({ reverseTarget: { path, line, requestId: reverseSeq } });
  },
  clearReverse: () => set({ reverseTarget: null }),
  reset: () =>
    set({
      highlights: [],
      jumpToPage: null,
      forwardRequestId: forwardSeq,
      reverseTarget: null,
    }),
}));
