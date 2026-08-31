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

export function GameProvider({ children }: GameProviderProps) {
  const [isGamePlaying, setIsGamePlaying] = useState(false);

  const setGamePlaying = useCallback(function memoizedCallback(playing: boolean) {
    setIsGamePlaying(playing);
  }, []);

  const value = useMemo(
    function createMemoizedValue() {
      return {
        isGamePlaying,
        setGamePlaying,
      };
    },
    [isGamePlaying, setGamePlaying],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
}
