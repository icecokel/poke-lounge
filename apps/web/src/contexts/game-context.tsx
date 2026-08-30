"use client";

import { createContext, useContext, useState, ReactNode, useCallback, useMemo } from "react";

interface GameContextValue {
  isGamePlaying: boolean;
  setGamePlaying: (playing: boolean) => void;
}

const GameContext = createContext<GameContextValue | undefined>(undefined);

interface GameProviderProps {
  children: ReactNode;
}

export const GameProvider = ({ children }: GameProviderProps) => {
  const [isGamePlaying, setIsGamePlaying] = useState(false);

  const setGamePlaying = useCallback((playing: boolean) => {
    setIsGamePlaying(playing);
  }, []);

  const value = useMemo(
    () => ({
      isGamePlaying,
      setGamePlaying,
    }),
    [isGamePlaying, setGamePlaying],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
};
