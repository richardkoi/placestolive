import { useEffect, useState } from "react";
import {
  applyTheme, loadSavedMode, loadSavedPaletteId, paletteById, saveMode,
  savePaletteId, type Mode, type Palette,
} from "./theme";

export interface ThemeState {
  mode: Mode;
  palette: Palette;
  setMode: (m: Mode) => void;
  setPaletteId: (id: string) => void;
}

// Pretty barebones — we don't need full Context, App.tsx just calls this hook
// at the top and passes mode/palette as props to the bits that care.
export function useTheme(): ThemeState {
  const [mode, setModeState] = useState<Mode>(loadSavedMode);
  const [paletteIdState, setPaletteIdState] = useState<string>(loadSavedPaletteId);

  const palette = paletteById(paletteIdState);

  useEffect(() => {
    applyTheme(mode, palette);
  }, [mode, palette]);

  return {
    mode,
    palette,
    setMode: (m) => { saveMode(m); setModeState(m); },
    setPaletteId: (id) => { savePaletteId(id); setPaletteIdState(id); },
  };
}
