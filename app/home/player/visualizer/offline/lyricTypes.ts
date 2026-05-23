export type LyricCue = {
  index: number;
  startSec: number;
  endSec: number | null;
  text: string;
};

export type LyricFrameState = {
  activeLineIndex: number | null;
  activeText: string | null;
  previousText: string | null;
  nextText: string | null;
  lineProgress01: number;
  lineAgeSec: number;
  timeToNextLineSec: number | null;
  isLineStart: boolean;
  isLineEnd: boolean;
  silence01: number;
};