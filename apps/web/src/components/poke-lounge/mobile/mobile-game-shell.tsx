"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { PokeLoungePartySlotMenu } from "../party-slot-menu";
import type { PokeLoungeCopy } from "../poke-lounge-copy";
import { PixelButton } from "../ui/poke-lounge-ui-primitives";
import { primePokeLoungeAudio } from "../runtime/game/audio/poke-lounge-audio";
import {
  type MobileBattleUiAction,
  type MobileBattleUiState,
} from "../runtime/game/ui/mobile-battle-ui";
import type { BattleUiStore } from "../runtime/game/battle/battle-ui-store";
import {
  type MobileWorldUiAction,
  type MobileWorldUiState,
  type PokeLoungePartySlotSummary,
} from "../runtime/game/ui/mobile-world-ui";
import type { WorldUiStore } from "../runtime/game/world/world-ui-store";
import { createShortcutGuideRows } from "../runtime/game/ui/shortcut-guide";
import {
  resetVirtualGamepad,
  virtualGamepadController,
  type VirtualGamepadButton,
  type VirtualGamepadController,
} from "../runtime/game/input/virtual-gamepad";
import styles from "./mobile-game-shell.module.css";

type MobileScene = "battle" | "world" | null;

const mobileBattleGridSlotCount = 4;

type MobileJoystickDirection = "up" | "down" | "left" | "right";
const mobileJoystickDirectionOrder = ["up", "down", "left", "right"] as const;

type MobileJoystickOffset = {
  x: number;
  y: number;
};

const mobileJoystickDeadZoneRatio = 0.24;
const mobileJoystickMaximumThumbOffsetRatio = 0.46;
const emptyMobileJoystickOffset: MobileJoystickOffset = { x: 0, y: 0 };
const subscribeToNothing = () => function callback() {};

const resolveMobileJoystickDirections = (
  offset: MobileJoystickOffset,
  radius: number,
): MobileJoystickDirection[] => {
  const distance = Math.hypot(offset.x, offset.y);

  if (distance < radius * mobileJoystickDeadZoneRatio) {
    return [];
  }

  const horizontalDirection = offset.x < 0 ? "left" : "right";
  const verticalDirection = offset.y < 0 ? "up" : "down";
  const horizontalMagnitude = Math.abs(offset.x);
  const verticalMagnitude = Math.abs(offset.y);
  const directions: MobileJoystickDirection[] = [];

  if (verticalMagnitude >= horizontalMagnitude / 2) {
    directions.push(verticalDirection);
  }

  if (horizontalMagnitude >= verticalMagnitude / 2) {
    directions.push(horizontalDirection);
  }

  return directions;
};

const clampMobileJoystickOffset = (
  offset: MobileJoystickOffset,
  radius: number,
): MobileJoystickOffset => {
  const distance = Math.hypot(offset.x, offset.y);
  const maximumOffset = radius * mobileJoystickMaximumThumbOffsetRatio;

  if (distance === 0 || distance <= maximumOffset) {
    return offset;
  }

  const ratio = maximumOffset / distance;

  return { x: offset.x * ratio, y: offset.y * ratio };
};

const getMobileJoystickKeyboardDirection = (key: string): MobileJoystickDirection | null => {
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";

  return null;
};

const getMobileJoystickKeyboardOffset = (
  directions: ReadonlyArray<MobileJoystickDirection>,
): MobileJoystickOffset => {
  const keyboardOffset = directions.length > 1 ? 24 : 32;

  return {
    x:
      (directions.includes("right") ? keyboardOffset : 0) -
      (directions.includes("left") ? keyboardOffset : 0),
    y:
      (directions.includes("down") ? keyboardOffset : 0) -
      (directions.includes("up") ? keyboardOffset : 0),
  };
};

export interface MobileRankingEntry {
  id: string;
  rank: number;
  name: string;
  score: number;
}

interface MobileSettingsProps {
  autosaveLabel: string;
  connectionLabel: string;
  hydrationFallbackMessage: string | null;
  hydrationRetryDisabled: boolean;
  hydrationRetryLabel: string;
  localRoomShare: boolean;
  onClose(): void;
  onExit(): void;
  onRetryHydration(): void;
  onRoomShare(): void;
  onVolumeCycle(): void;
  onRetryRanking(): void;
  open: boolean;
  partySlots: PokeLoungePartySlotSummary[];
  ranking: MobileRankingEntry[];
  rankingStatus: "idle" | "loading" | "ready" | "error";
  roomShareAvailable: boolean;
  roomShareStatus: "idle" | "success" | "error";
  volumeAriaLabel: string;
  volumeLabel: string;
}

export interface MobileGameShellProps {
  activeScene: MobileScene;
  battleUiStore?: BattleUiStore;
  copy: PokeLoungeCopy;
  onOpenSettings(): void;
  settings: MobileSettingsProps;
  worldInput?: VirtualGamepadController;
  worldUiStore?: WorldUiStore;
}

export function MobileGameShell({
  activeScene,
  battleUiStore,
  copy,
  onOpenSettings,
  settings,
  worldInput = virtualGamepadController,
  worldUiStore,
}: MobileGameShellProps) {
  const worldState = useSyncExternalStore(
    worldUiStore?.subscribe ?? subscribeToNothing,
    function callback() {
      return worldUiStore?.getSnapshot().mobile ?? null;
    },
    function callback() {
      return null;
    },
  );

  const dispatchWorldAction = (action: MobileWorldUiAction) => {
    worldInput.reset();
    void primePokeLoungeAudio();
    worldUiStore?.dispatch(action);
  };
  const isWorldSceneOpen = activeScene === "world" && worldState?.screen !== "explore";

  return (
    <>
      <section
        className={styles.shell}
        aria-label={copy.mobile.exploreDeckLabel}
        data-poke-lounge-mobile-control-dock="true"
      >
        <div className={styles.topBar}>
          <span className={styles.screenBadge}>
            {activeScene === "battle" ? copy.mobile.battleDeckLabel : copy.mobile.exploreDeckLabel}
          </span>
          <div className={styles.utilityActions}>
            <button
              type="button"
              className={styles.utilityButton}
              onClick={function handleClick() {
                if (activeScene === "world") worldInput.reset();
                else resetVirtualGamepad();
                onOpenSettings();
              }}
              aria-label={copy.settingsOpenLabel}
              data-poke-lounge-mobile-menu="true"
            >
              ☰
            </button>
            {activeScene ? (
              <button
                type="button"
                className={styles.utilityButton}
                onClick={function handleClick() {
                  if (activeScene === "world") {
                    dispatchWorldAction({ type: "open-help" });
                    return;
                  }

                  resetVirtualGamepad();
                  void primePokeLoungeAudio();
                  battleUiStore?.dispatch({ type: "toggle-help" });
                }}
                aria-label={copy.mobile.help}
                data-poke-lounge-mobile-help="true"
              >
                ?
              </button>
            ) : null}
          </div>
        </div>
        {activeScene === "battle" ? (
          <MobileBattleDeck copy={copy} uiStore={battleUiStore} />
        ) : (
          <MobileExploreDeck
            copy={copy}
            input={worldInput}
            onAction={dispatchWorldAction}
            worldState={worldState}
          />
        )}
      </section>
      {isWorldSceneOpen && worldState ? (
        <MobileWorldScreen copy={copy} onAction={dispatchWorldAction} state={worldState} />
      ) : null}
      <MobileSettingsScreen copy={copy} {...settings} />
    </>
  );
}

function MobileExploreDeck({
  copy,
  input,
  onAction,
  worldState,
}: {
  copy: PokeLoungeCopy;
  input: VirtualGamepadController;
  onAction(action: MobileWorldUiAction): void;
  worldState: MobileWorldUiState | null;
}) {
  const activePokemon = worldState?.party.find(function findItem(pokemon) {
    return pokemon.isActive && !pokemon.isEmpty;
  });
  const hasActivePokemonHp = activePokemon?.currentHp !== null && activePokemon?.maxHp !== null;

  return (
    <div className={styles.exploreDeck} data-poke-lounge-mobile-deck="explore">
      <div className={styles.fieldContext}>
        <p className={styles.exploreHint}>{copy.mobile.exploreHint}</p>
        {activePokemon ? (
          <div className={styles.activePokemon}>
            <strong>{activePokemon.name}</strong>
            {hasActivePokemonHp ? (
              <span>
                {formatMobileHp(activePokemon.currentHp, activePokemon.maxHp, activePokemon.status)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className={styles.controlCluster}>
        <MobileDirectionalJoystick ariaLabel={copy.mobile.exploreDeckLabel} input={input} />
        <div className={styles.fieldActions}>
          <TouchHoldButton
            control="confirm"
            className={styles.primaryAction}
            ariaLabel={copy.mobile.interact}
            input={input}
          >
            <span>A</span>
            <small>{copy.mobile.interact}</small>
          </TouchHoldButton>
          <TouchHoldButton
            control="bag"
            className={styles.secondaryAction}
            ariaLabel={copy.mobile.bag}
            input={input}
          >
            <span>I</span>
            <small>{copy.mobile.bag}</small>
          </TouchHoldButton>
          <button
            type="button"
            className={styles.partyAction}
            onClick={function handleClick() {
              return onAction({ type: "open-party" });
            }}
            data-poke-lounge-mobile-party="true"
          >
            <span>P</span>
            <small>{copy.mobile.party}</small>
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileDirectionalJoystick({
  ariaLabel,
  input,
}: {
  ariaLabel: string;
  input: VirtualGamepadController;
}) {
  const [activeDirections, setActiveDirections] = useState<MobileJoystickDirection[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [thumbOffset, setThumbOffset] = useState<MobileJoystickOffset>(emptyMobileJoystickOffset);
  const activeDirectionsRef = useRef(new Set<MobileJoystickDirection>());
  const activePointerId = useRef<number | null>(null);

  useEffect(
    function runEffect() {
      return function callback() {
        for (const direction of activeDirectionsRef.current) {
          input.setHeld(direction, false);
        }
      };
    },
    [input],
  );

  const holdDirections = (directions: ReadonlyArray<MobileJoystickDirection>) => {
    const nextDirections = new Set(directions);

    if (
      activeDirectionsRef.current.size === nextDirections.size &&
      [...nextDirections].every(function testItem(direction) {
        return activeDirectionsRef.current.has(direction);
      })
    ) {
      return;
    }

    for (const direction of mobileJoystickDirectionOrder) {
      if (activeDirectionsRef.current.has(direction) !== nextDirections.has(direction)) {
        input.setHeld(direction, nextDirections.has(direction));
      }
    }

    activeDirectionsRef.current = nextDirections;
    setActiveDirections(
      mobileJoystickDirectionOrder.filter(function filterItem(direction) {
        return nextDirections.has(direction);
      }),
    );
  };

  const release = (pointerId?: number) => {
    if (pointerId !== undefined && activePointerId.current !== pointerId) {
      return;
    }

    activePointerId.current = null;
    setIsActive(false);
    setThumbOffset(emptyMobileJoystickOffset);
    holdDirections([]);
  };

  const updateFromPointer = (target: HTMLDivElement, event: PointerEvent<HTMLDivElement>) => {
    const rect = target.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2;
    const offset = {
      x: event.clientX - (rect.left + rect.width / 2),
      y: event.clientY - (rect.top + rect.height / 2),
    };

    setThumbOffset(clampMobileJoystickOffset(offset, radius));
    holdDirections(resolveMobileJoystickDirections(offset, radius));
  };

  return (
    <div
      className={styles.joystick}
      role="group"
      tabIndex={0}
      aria-label={ariaLabel}
      data-active={isActive || undefined}
      data-direction={activeDirections.length > 0 ? activeDirections.join("-") : undefined}
      data-poke-lounge-mobile-joystick="true"
      onPointerDown={function handlePointerDown(event) {
        event.preventDefault();
        activePointerId.current = event.pointerId;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Synthetic events used by interaction tests cannot always capture pointers.
        }
        setIsActive(true);
        void primePokeLoungeAudio();
        updateFromPointer(event.currentTarget, event);
      }}
      onPointerMove={function handlePointerMove(event) {
        if (activePointerId.current === event.pointerId) {
          updateFromPointer(event.currentTarget, event);
        }
      }}
      onPointerUp={function handlePointerUp(event) {
        return release(event.pointerId);
      }}
      onPointerCancel={function handlePointerCancel(event) {
        return release(event.pointerId);
      }}
      onLostPointerCapture={function handleLostPointerCapture() {
        return release();
      }}
      onBlur={function handleBlur() {
        return release();
      }}
      onKeyDown={function handleKeyDown(event) {
        const direction = getMobileJoystickKeyboardDirection(event.key);

        if (!direction) {
          return;
        }

        event.preventDefault();
        const directions = mobileJoystickDirectionOrder.filter(function filterItem(candidate) {
          return activeDirectionsRef.current.has(candidate) || candidate === direction;
        });

        setIsActive(true);
        setThumbOffset(getMobileJoystickKeyboardOffset(directions));
        holdDirections(directions);
      }}
      onKeyUp={function handleKeyUp(event) {
        const direction = getMobileJoystickKeyboardDirection(event.key);

        if (!direction) {
          return;
        }

        event.preventDefault();
        const directions = mobileJoystickDirectionOrder.filter(function filterItem(candidate) {
          return candidate !== direction && activeDirectionsRef.current.has(candidate);
        });

        if (directions.length === 0) {
          release();
          return;
        }

        setThumbOffset(getMobileJoystickKeyboardOffset(directions));
        holdDirections(directions);
      }}
    >
      <span
        className={styles.joystickThumb}
        aria-hidden="true"
        style={{
          transform: `translate(calc(-50% + ${thumbOffset.x}px), calc(-50% + ${thumbOffset.y}px))`,
        }}
      />
    </div>
  );
}

export function MobileWorldScreen({
  copy,
  onAction,
  state,
  variant = "mobile",
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileWorldUiAction): void;
  state: MobileWorldUiState;
  variant?: "desktop" | "mobile";
}) {
  const close = () => onAction({ type: "close" });
  const back = () => onAction({ type: "back" });
  let content: ReactNode;
  let footer: ReactNode = null;

  if (state.screen === "help") {
    content = <MobileWorldHelpScreen state={state} />;
  } else if (state.screen === "inventory-items") {
    content = <MobileInventoryItemList onAction={onAction} state={state} />;
    footer = (
      <MobileWorldSceneFooter
        copy={copy}
        onBack={back}
        onConfirm={function handleConfirm() {
          return onAction({ type: "use-inventory-item" });
        }}
        confirmLabel={copy.mobile.use}
      />
    );
  } else if (state.screen === "inventory-party") {
    content = <MobileInventoryPartyTarget onAction={onAction} state={state} />;
    footer = (
      <MobileWorldSceneFooter
        copy={copy}
        onBack={back}
        onConfirm={function handleConfirm() {
          return onAction({ type: "use-inventory-item" });
        }}
        confirmLabel={copy.mobile.use}
      />
    );
  } else if (state.screen === "inventory-move-replace") {
    content = <MobileInventoryMoveReplacement copy={copy} onAction={onAction} state={state} />;
    footer = (
      <MobileWorldSceneFooter
        backLabel={copy.mobile.doNotLearnMove}
        copy={copy}
        onBack={function handleBack() {
          return onAction({ type: "skip-inventory-move" });
        }}
        onConfirm={function handleConfirm() {
          return onAction({ type: "use-inventory-item" });
        }}
        confirmLabel={copy.mobile.confirmMoveReplacement}
      />
    );
  } else if (state.screen === "shop") {
    content = <MobileShopPanel onAction={onAction} state={state} />;
    footer = (
      <MobileWorldSceneFooter
        copy={copy}
        onBack={back}
        onConfirm={function handleConfirm() {
          return onAction({ type: "purchase-shop-item" });
        }}
        confirmLabel={copy.mobile.buy}
        confirmDisabled={state.items.length === 0}
      />
    );
  } else if (state.screen === "pc") {
    const confirmLabel = state.pcFocus === "party" ? copy.mobile.deposit : copy.mobile.withdraw;
    content = <MobilePcPanel copy={copy} onAction={onAction} state={state} />;
    footer = (
      <MobileWorldSceneFooter
        copy={copy}
        onBack={back}
        onConfirm={function handleConfirm() {
          return onAction({ type: "confirm-pc-selection" });
        }}
        confirmLabel={confirmLabel}
      />
    );
  } else if (state.screen === "dice") {
    content = <MobileDicePanel onAction={onAction} state={state} />;
    footer = (
      <MobileWorldSceneFooter
        copy={copy}
        onBack={back}
        onConfirm={function handleConfirm() {
          return onAction({ type: "confirm-dice-selection" });
        }}
        confirmLabel={copy.mobile.roll}
      />
    );
  } else {
    content = <MobilePartyPanel copy={copy} onAction={onAction} state={state} />;
  }

  return (
    <section
      className={`${styles.worldScene} ${variant === "desktop" ? styles.worldSceneDesktop : ""}`}
      aria-labelledby="poke-lounge-mobile-world-scene-title"
      data-poke-lounge-mobile-deck={variant === "mobile" ? `world-${state.screen}` : undefined}
      data-poke-lounge-mobile-fullscreen-scene={variant === "mobile" ? "true" : undefined}
      data-poke-lounge-world-surface={state.screen}
    >
      <MobileWorldSceneHeader
        copy={copy}
        onClose={close}
        showClose={state.screen !== "inventory-move-replace"}
        title={state.title}
        walletPokeDollars={state.walletPokeDollars}
      />
      <div className={styles.worldSceneBody}>{content}</div>
      {footer}
    </section>
  );
}

export function MobileWorldHelpScreen({ state }: { state: MobileWorldUiState }) {
  return (
    <ul className={styles.helpList}>
      {createShortcutGuideRows("world", state.inputMode).map(function mapItem(row) {
        return (
          <li key={row.action}>
            <b>{row.action}</b>
            <span>{row.keys}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function MobileInventoryItemList({
  onAction,
  state,
}: {
  onAction(action: MobileWorldUiAction): void;
  state: MobileWorldUiState;
}) {
  return (
    <div className={styles.inventoryLayout}>
      <div className={styles.inventoryGrid}>
        {state.items.map(function mapItem(item) {
          return (
            <PixelButton
              key={item.id}
              className={styles.inventorySlot}
              data-poke-lounge-inventory-item={item.id}
              selected={item.selected}
              onClick={function handleClick() {
                return onAction({ type: "select-inventory-item", index: item.index });
              }}
            >
              <span className={styles.inventorySlotGlyph} aria-hidden="true">
                {item.name.slice(0, 1)}
              </span>
              <span className={styles.inventorySlotName}>{item.name}</span>
              <small className={styles.inventorySlotCount}>×{item.count}</small>
            </PixelButton>
          );
        })}
      </div>
      <div className={styles.inventoryDetail}>
        <p className={styles.detailText}>
          {state.selectedItemDescription || "사용할 아이템이 없습니다."}
        </p>
        <MobileWorldMessage message={state.message} />
      </div>
    </div>
  );
}

export function MobileInventoryPartyTarget({
  onAction,
  state,
}: {
  onAction(action: MobileWorldUiAction): void;
  state: MobileWorldUiState;
}) {
  return (
    <>
      <p className={styles.detailText}>{state.selectedItemName}</p>
      <div className={styles.compactList}>
        {state.party
          .filter(function filterItem(pokemon) {
            return !pokemon.isEmpty;
          })
          .map(function mapItem(pokemon) {
            return (
              <button
                key={pokemon.slotIndex}
                type="button"
                className={styles.listButton}
                data-poke-lounge-inventory-party-slot={pokemon.slotIndex}
                data-selected={pokemon.slotIndex === state.selectedPartySlotIndex}
                onClick={function handleClick() {
                  return onAction({ type: "select-inventory-party", slotIndex: pokemon.slotIndex });
                }}
              >
                <span>{pokemon.name}</span>
                <small>{formatMobileHp(pokemon.currentHp, pokemon.maxHp, pokemon.status)}</small>
              </button>
            );
          })}
      </div>
      <MobileWorldMessage message={state.message} />
    </>
  );
}

export function MobileInventoryMoveReplacement({
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileWorldUiAction): void;
  state: MobileWorldUiState;
}) {
  if (!state.moveReplacement) {
    return <MobileWorldMessage message="기술 교체 정보를 불러올 수 없습니다." />;
  }

  return (
    <>
      <p className={styles.detailText}>
        {copy.mobile.moveReplacementPrompt(
          state.moveReplacement.pokemonName,
          state.moveReplacement.newMoveName,
        )}
      </p>
      <div className={styles.compactList}>
        {state.moveReplacement.moves.map(function mapItem(move) {
          return (
            <button
              key={move.id}
              type="button"
              className={styles.listButton}
              data-poke-lounge-move-replacement={move.id}
              data-selected={move.selected}
              onClick={function handleClick() {
                return onAction({ type: "select-inventory-move", index: move.index });
              }}
            >
              <span>{move.name}</span>
              <small>{move.selected ? copy.mobile.forgetMove : ""}</small>
            </button>
          );
        })}
      </div>
      <MobileWorldMessage message={state.message} />
    </>
  );
}

export function MobileShopPanel({
  onAction,
  state,
}: {
  onAction(action: MobileWorldUiAction): void;
  state: MobileWorldUiState;
}) {
  return (
    <>
      <div className={styles.compactList}>
        {state.items.map(function mapItem(item) {
          return (
            <button
              key={item.id}
              type="button"
              className={styles.listButton}
              data-poke-lounge-shop-item={item.id}
              data-selected={item.selected}
              onClick={function handleClick() {
                return onAction({ type: "select-shop-item", index: item.index });
              }}
            >
              <span>{item.name}</span>
              <small>
                {formatMobilePokeDollars(item.price ?? 0)} · ×{item.count}
              </small>
            </button>
          );
        })}
      </div>
      <p className={styles.detailText}>{state.selectedItemDescription}</p>
      <MobileWorldMessage message={state.message} />
    </>
  );
}

export function MobilePcPanel({
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileWorldUiAction): void;
  state: MobileWorldUiState;
}) {
  const isPartyFocused = state.pcFocus === "party";

  return (
    <>
      <div className={styles.pcTabs}>
        <button
          type="button"
          className={styles.panelAction}
          data-selected={isPartyFocused}
          onClick={function handleClick() {
            return onAction({ type: "select-pc-focus", focus: "party" });
          }}
        >
          {copy.mobile.pcParty}
        </button>
        <button
          type="button"
          className={styles.panelAction}
          data-selected={!isPartyFocused}
          onClick={function handleClick() {
            return onAction({ type: "select-pc-focus", focus: "box" });
          }}
        >
          {copy.mobile.pcBox}
        </button>
      </div>
      <div className={styles.compactList}>
        {isPartyFocused ? (
          state.party.map(function mapItem(pokemon) {
            return (
              <button
                key={pokemon.slotIndex}
                type="button"
                className={styles.listButton}
                data-poke-lounge-pc-party-slot={pokemon.slotIndex}
                data-selected={pokemon.slotIndex === state.selectedPartySlotIndex}
                onClick={function handleClick() {
                  return onAction({ type: "select-pc-party", slotIndex: pokemon.slotIndex });
                }}
              >
                <span>{pokemon.isEmpty ? "-" : pokemon.name}</span>
                <small>
                  {pokemon.isEmpty
                    ? ""
                    : formatMobileHp(pokemon.currentHp, pokemon.maxHp, pokemon.status)}
                </small>
              </button>
            );
          })
        ) : state.box.length > 0 ? (
          state.box.map(function mapItem(pokemon) {
            return (
              <button
                key={pokemon.boxIndex}
                type="button"
                className={styles.listButton}
                data-poke-lounge-pc-box-slot={pokemon.boxIndex}
                data-selected={pokemon.selected}
                onClick={function handleClick() {
                  return onAction({ type: "select-pc-box", boxIndex: pokemon.boxIndex });
                }}
              >
                <span>{pokemon.name}</span>
                <small>{formatMobileHp(pokemon.currentHp, pokemon.maxHp, pokemon.status)}</small>
              </button>
            );
          })
        ) : (
          <p className={styles.emptyList}>비어 있음</p>
        )}
      </div>
      <MobileWorldMessage message={state.message} />
    </>
  );
}

export function MobileDicePanel({
  onAction,
  state,
}: {
  onAction(action: MobileWorldUiAction): void;
  state: MobileWorldUiState;
}) {
  return (
    <>
      {state.dice ? (
        <>
          <p className={styles.diceMeta}>
            기준 {state.dice.targetNumber} · 배팅{" "}
            {formatMobilePokeDollars(state.dice.stakePokeDollars)}
          </p>
          <div className={styles.compactList}>
            {state.dice.options.map(function mapItem(option) {
              return (
                <button
                  key={option.prediction}
                  type="button"
                  className={styles.listButton}
                  data-poke-lounge-dice-option={option.prediction}
                  data-selected={option.selected}
                  disabled={option.disabled}
                  onClick={function handleClick() {
                    return onAction({
                      type: "select-dice-prediction",
                      prediction: option.prediction,
                    });
                  }}
                >
                  <span>{option.label}</span>
                  <small>
                    {option.winningCaseCount}/6 ·{" "}
                    {formatMobilePokeDollars(option.rewardPokeDollars)}
                  </small>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
      <MobileWorldMessage message={state.message} />
    </>
  );
}

export function MobilePartyPanel({
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileWorldUiAction): void;
  state: MobileWorldUiState;
}) {
  return (
    <div className={styles.compactList}>
      {state.party.map(function mapItem(pokemon) {
        return (
          <button
            key={pokemon.slotIndex}
            type="button"
            className={styles.listButton}
            data-poke-lounge-mobile-party-slot={pokemon.slotIndex}
            data-selected={pokemon.isActive}
            data-empty={pokemon.isEmpty || undefined}
            disabled={pokemon.isEmpty || !pokemon.canSetAsLead}
            onClick={function handleClick() {
              return onAction({ type: "set-party-lead", slotIndex: pokemon.slotIndex });
            }}
          >
            <span>
              {pokemon.isEmpty ? copy.partySlotLabel(pokemon.slotIndex + 1) : pokemon.name}
            </span>
            <small>
              {pokemon.isEmpty
                ? copy.partySlotEmpty
                : pokemon.isActive
                  ? copy.partySlotLead
                  : pokemon.canSetAsLead
                    ? copy.mobile.setLead
                    : formatMobileHp(pokemon.currentHp, pokemon.maxHp, pokemon.status)}
            </small>
          </button>
        );
      })}
    </div>
  );
}

function MobileWorldSceneHeader({
  copy,
  onClose,
  showClose,
  title,
  walletPokeDollars,
}: {
  copy: PokeLoungeCopy;
  onClose(): void;
  showClose: boolean;
  title: string;
  walletPokeDollars: number;
}) {
  return (
    <header className={styles.worldSceneHeader}>
      {showClose ? (
        <button
          type="button"
          className={styles.sceneBack}
          onClick={onClose}
          aria-label={copy.mobile.back}
          data-poke-lounge-mobile-deck-close="true"
        >
          <span aria-hidden="true">‹</span>
          <span>{copy.mobile.back}</span>
        </button>
      ) : (
        <span aria-hidden="true" />
      )}
      <strong id="poke-lounge-mobile-world-scene-title" className={styles.worldSceneTitle}>
        {title}
      </strong>
      <MobileWorldMeta copy={copy} value={walletPokeDollars} />
    </header>
  );
}

function MobileWorldSceneFooter({
  backLabel,
  confirmDisabled = false,
  confirmLabel,
  copy,
  onBack,
  onConfirm,
}: {
  backLabel?: string;
  confirmDisabled?: boolean;
  confirmLabel: string;
  copy: PokeLoungeCopy;
  onBack(): void;
  onConfirm(): void;
}) {
  return (
    <footer className={styles.deckFooter}>
      <button type="button" className={styles.panelAction} onClick={onBack}>
        ‹ {backLabel ?? copy.mobile.back}
      </button>
      <button
        type="button"
        className={styles.panelActionPrimary}
        disabled={confirmDisabled}
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
    </footer>
  );
}

function MobileWorldMeta({ copy, value }: { copy: PokeLoungeCopy; value: number }) {
  return (
    <p className={styles.deckMeta}>
      {copy.mobile.wallet} · {formatMobilePokeDollars(value)}
    </p>
  );
}

function MobileWorldMessage({ message }: { message: string }) {
  return message ? <p className={styles.deckMessage}>{message}</p> : null;
}

function formatMobilePokeDollars(value: number): string {
  return `₽ ${Math.max(0, Math.floor(value)).toLocaleString("en-US")}`;
}

function formatMobileHp(
  currentHp: number | null,
  maxHp: number | null,
  status: string | null,
): string {
  if (currentHp === null || maxHp === null) {
    return "- / -";
  }

  const statusLabel = status && status !== "normal" ? ` · ${status}` : "";

  return `${currentHp}/${maxHp}${statusLabel}`;
}

export function MobileBattleDeck({
  copy,
  uiStore,
}: {
  copy: PokeLoungeCopy;
  uiStore?: BattleUiStore;
}) {
  const battleState = useSyncExternalStore(
    uiStore?.subscribe ?? subscribeToNothing,
    function callback() {
      return uiStore?.getSnapshot().controls ?? null;
    },
    function callback() {
      return null;
    },
  );

  const dispatchAction = (action: MobileBattleUiAction) => {
    void primePokeLoungeAudio();
    uiStore?.dispatch(action);
  };

  if (!battleState) {
    return <p className={styles.deckNotice}>{copy.mobile.preparing}</p>;
  }

  if (battleState.isHelpOpen) {
    return <MobileBattleHelpDeck copy={copy} onAction={dispatchAction} />;
  }

  if (battleState.message) {
    return <MobileBattleMessageDeck copy={copy} onAction={dispatchAction} state={battleState} />;
  }

  if (battleState.isInputLocked || battleState.phase === "resolving") {
    return <MobileBattleWaitingDeck copy={copy} />;
  }

  if (battleState.phase === "command") {
    return <MobileBattleCommandDeck copy={copy} onAction={dispatchAction} state={battleState} />;
  }

  if (battleState.phase === "move-select" || battleState.phase === "move-replace-select") {
    return <MobileBattleMoveDeck copy={copy} onAction={dispatchAction} state={battleState} />;
  }

  if (battleState.phase === "party-select") {
    return <MobileBattlePartyDeck copy={copy} onAction={dispatchAction} state={battleState} />;
  }

  if (battleState.phase === "bag-select") {
    return <MobileBattleBagDeck copy={copy} onAction={dispatchAction} state={battleState} />;
  }

  return <MobileBattleWaitingDeck copy={copy} />;
}

function MobileBattleBackButton({
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileBattleUiAction): void;
  state: MobileBattleUiState;
}) {
  if (!state.canGoBack) return null;
  const label =
    state.phase === "move-replace-select" ? copy.mobile.doNotLearnMove : copy.mobile.back;
  return (
    <button
      type="button"
      className={styles.backButton}
      onClick={function handleClick() {
        return onAction({ type: "go-back" });
      }}
      aria-label={label}
    >
      ‹ {label}
    </button>
  );
}

export function MobileBattleCommandDeck({
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileBattleUiAction): void;
  state: MobileBattleUiState;
}) {
  const labels = {
    bag: copy.mobile.bag,
    fight: copy.mobile.fight,
    pokemon: copy.mobile.party,
    run: copy.mobile.run,
  };
  return (
    <div className={styles.commandDeck} data-poke-lounge-mobile-deck="battle-command">
      {state.commands.map(function mapItem(command, index) {
        return (
          <button
            key={command.id}
            type="button"
            className={styles.commandButton}
            data-selected={command.selected}
            onClick={function handleClick() {
              return onAction({ type: "select-command", index });
            }}
          >
            {labels[command.id]}
          </button>
        );
      })}
    </div>
  );
}

export function MobileBattleMoveDeck({
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileBattleUiAction): void;
  state: MobileBattleUiState;
}) {
  const actionType = state.phase === "move-select" ? "select-move" : "select-move-replacement";
  const moveReplacement = state.moveReplacement;
  const title = moveReplacement
    ? copy.mobile.moveReplacementPrompt(moveReplacement.pokemonName, moveReplacement.newMoveName)
    : copy.mobile.chooseMove;
  return (
    <div className={styles.selectionDeck} data-poke-lounge-mobile-deck="battle-moves">
      <div className={styles.deckHeading}>
        <div
          className={styles.moveReplacementSummary}
          data-poke-lounge-mobile-move-replacement={moveReplacement ? "true" : undefined}
        >
          <strong>{title}</strong>
          {moveReplacement ? (
            <small>
              {moveReplacement.newMoveName} · PP {moveReplacement.newMovePp}/
              {moveReplacement.newMoveMaxPp} · {moveReplacement.newMoveType}
            </small>
          ) : null}
        </div>
        <MobileBattleBackButton copy={copy} onAction={onAction} state={state} />
      </div>
      <div className={styles.optionGrid} data-poke-lounge-mobile-option-grid="moves">
        {state.moves.map(function mapItem(move) {
          return (
            <button
              key={move.index}
              type="button"
              className={styles.moveButton}
              data-selected={move.selected}
              disabled={move.disabled}
              aria-label={
                moveReplacement
                  ? `${move.name} · ${copy.mobile.forgetMove} → ${moveReplacement.newMoveName}`
                  : undefined
              }
              onClick={function handleClick() {
                return onAction({ type: actionType, index: move.index });
              }}
            >
              <span>{move.name}</span>
              <small>
                PP {move.pp}/{move.maxPp} · {move.type}
                {move.effectNotice ? ` · ${move.effectNotice}` : ""}
                {moveReplacement ? ` · ${copy.mobile.forgetMove}` : ""}
              </small>
            </button>
          );
        })}
        <MobileBattleEmptySlots occupiedSlotCount={state.moves.length} />
      </div>
    </div>
  );
}

export function MobileBattlePartyDeck({
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileBattleUiAction): void;
  state: MobileBattleUiState;
}) {
  return (
    <div className={styles.selectionDeck} data-poke-lounge-mobile-deck="battle-party">
      <div className={styles.deckHeading}>
        <strong>{copy.mobile.chooseParty}</strong>
        <MobileBattleBackButton copy={copy} onAction={onAction} state={state} />
      </div>
      <div className={styles.partyList}>
        {state.party.map(function mapItem(pokemon) {
          return (
            <button
              key={pokemon.slotIndex}
              type="button"
              className={styles.partyButton}
              data-current={pokemon.isCurrent}
              data-selected={pokemon.selected}
              disabled={!pokemon.canSwitch}
              onClick={function handleClick() {
                return onAction({ type: "select-party", index: pokemon.slotIndex });
              }}
            >
              <span>
                {pokemon.name} <small>Lv.{pokemon.level}</small>
              </span>
              <small>
                {pokemon.isCurrent
                  ? "ON FIELD"
                  : `${pokemon.currentHp}/${pokemon.maxHp}${pokemon.status ? ` · ${pokemon.status}` : ""}`}
              </small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MobileBattleBagDeck({
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileBattleUiAction): void;
  state: MobileBattleUiState;
}) {
  return (
    <div className={styles.selectionDeck} data-poke-lounge-mobile-deck="battle-bag">
      <div className={styles.deckHeading}>
        <strong>{copy.mobile.chooseItem}</strong>
        <MobileBattleBackButton copy={copy} onAction={onAction} state={state} />
      </div>
      <div className={styles.itemList} data-poke-lounge-mobile-option-grid="items">
        {state.items.map(function mapItem(item) {
          return (
            <button
              key={item.id}
              type="button"
              className={styles.itemButton}
              data-selected={item.selected}
              disabled={item.disabled}
              onClick={function handleClick() {
                return onAction({ type: "select-item", index: item.index });
              }}
            >
              <span>{item.name}</span>
              <small>×{item.count}</small>
            </button>
          );
        })}
        <MobileBattleEmptySlots occupiedSlotCount={state.items.length} />
      </div>
    </div>
  );
}

export function MobileBattleHelpDeck({
  copy,
  onAction,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileBattleUiAction): void;
}) {
  return (
    <div className={styles.selectionDeck} data-poke-lounge-mobile-deck="battle-help">
      <div className={styles.deckHeading}>
        <strong>{copy.mobile.help}</strong>
        <button
          type="button"
          className={styles.backButton}
          onClick={function handleClick() {
            return onAction({ type: "toggle-help" });
          }}
          data-poke-lounge-mobile-battle-help-close="true"
        >
          {copy.settingsClose}
        </button>
      </div>
      <ul className={`${styles.helpList} ${styles.battleHelpList}`}>
        <li>
          <b>{copy.mobile.battleDeckLabel}</b>
          <span>{copy.mobile.battleHelpChoose}</span>
        </li>
        <li>
          <b>{copy.mobile.next}</b>
          <span>{copy.mobile.battleHelpAdvance}</span>
        </li>
        <li>
          <b>{copy.mobile.back}</b>
          <span>{copy.mobile.battleHelpBack}</span>
        </li>
      </ul>
    </div>
  );
}

export function MobileBattleMessageDeck({
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileBattleUiAction): void;
  state: MobileBattleUiState;
}) {
  if (!state.message) return null;
  return (
    <div className={styles.messageDeck} data-poke-lounge-mobile-deck="battle-message">
      <p data-poke-lounge-mobile-battle-message="true">{state.message}</p>
      <button
        type="button"
        className={styles.nextButton}
        aria-label={`${state.message} ${copy.mobile.next}`}
        onClick={function handleClick() {
          return onAction({ type: "confirm-message" });
        }}
        disabled={state.isInputLocked}
      >
        {copy.mobile.next} <span>›</span>
      </button>
    </div>
  );
}

export function MobileBattleWaitingDeck({ copy }: { copy: PokeLoungeCopy }) {
  return <p className={styles.deckNotice}>{copy.mobile.waiting}</p>;
}

function MobileBattleEmptySlots({ occupiedSlotCount }: { occupiedSlotCount: number }) {
  return Array.from(
    { length: Math.max(0, mobileBattleGridSlotCount - occupiedSlotCount) },
    function callback(_, index) {
      return (
        <div
          key={`empty-battle-slot-${index}`}
          aria-hidden="true"
          className={styles.emptyOptionSlot}
          data-poke-lounge-mobile-empty-slot="true"
        />
      );
    },
  );
}

function MobileSettingsScreen({
  autosaveLabel,
  connectionLabel,
  copy,
  hydrationFallbackMessage,
  hydrationRetryDisabled,
  hydrationRetryLabel,
  localRoomShare,
  onClose,
  onExit,
  onRetryHydration,
  onRetryRanking,
  onRoomShare,
  onVolumeCycle,
  open,
  partySlots,
  ranking,
  rankingStatus,
  roomShareAvailable,
  roomShareStatus,
  volumeAriaLabel,
  volumeLabel,
}: MobileSettingsProps & { copy: PokeLoungeCopy }) {
  if (!open) {
    return null;
  }

  return (
    <section
      className={styles.settingsScreen}
      aria-labelledby="poke-lounge-mobile-settings-title"
      data-poke-lounge-mobile-fullscreen-scene="true"
      data-poke-lounge-mobile-settings-screen="true"
    >
      <header className={styles.settingsHeader}>
        <div>
          <p>Poke Lounge</p>
          <h2 id="poke-lounge-mobile-settings-title">{copy.settingsTitle}</h2>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          data-poke-lounge-mobile-settings-close="true"
        >
          {copy.settingsClose}
        </Button>
      </header>
      <p className={styles.settingsDescription}>{copy.settingsDescription}</p>
      <div className={styles.settingsOptions}>
        <Button
          type="button"
          variant="outline"
          onClick={onVolumeCycle}
          aria-label={volumeAriaLabel}
        >
          {volumeLabel}
        </Button>
        {roomShareAvailable ? (
          <Button type="button" variant="outline" onClick={onRoomShare}>
            {roomShareStatus === "success"
              ? copy.settingsShareCopied
              : roomShareStatus === "error"
                ? copy.settingsShareFailed
                : localRoomShare
                  ? copy.settingsLocalShare
                  : copy.settingsShare}
          </Button>
        ) : null}
        {hydrationFallbackMessage ? (
          <Button
            type="button"
            variant="outline"
            onClick={onRetryHydration}
            disabled={hydrationRetryDisabled}
            data-testid="poke-lounge-state-hydration-retry"
          >
            {hydrationRetryLabel}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          className={styles.settingsExitButton}
          onClick={onExit}
          data-poke-lounge-mobile-game-exit="true"
        >
          {copy.settingsExit}
        </Button>
      </div>
      <div className={styles.settingsStatus} aria-live="polite">
        <span>{connectionLabel}</span>
        <span>{autosaveLabel}</span>
        {hydrationFallbackMessage ? (
          <span data-testid="poke-lounge-state-hydration-local-fallback">
            {hydrationFallbackMessage}
          </span>
        ) : null}
      </div>
      <PokeLoungePartySlotMenu copy={copy} party={partySlots} />
      <section className={styles.rankingSection} aria-labelledby="poke-lounge-mobile-ranking-title">
        <div className={styles.rankingHeader}>
          <h3 id="poke-lounge-mobile-ranking-title">{copy.settingsRankingTitle}</h3>
          <span>{copy.settingsRankingCaption}</span>
        </div>
        {rankingStatus === "loading" || rankingStatus === "idle" ? (
          <p>{copy.settingsRankingLoading}</p>
        ) : null}
        {rankingStatus === "error" ? (
          <div className={styles.rankingRetry}>
            <p>{copy.settingsRankingError}</p>
            <Button type="button" variant="outline" onClick={onRetryRanking}>
              {copy.settingsRankingRetry}
            </Button>
          </div>
        ) : null}
        {rankingStatus === "ready" && ranking.length === 0 ? (
          <p>{copy.settingsRankingEmpty}</p>
        ) : null}
        {rankingStatus === "ready" && ranking.length > 0 ? (
          <ol className={styles.rankingList}>
            {ranking.map(function mapItem(entry) {
              return (
                <li key={entry.id}>
                  <span>#{entry.rank}</span>
                  <strong>{entry.name}</strong>
                  <b>{entry.score.toLocaleString(copy.locale)}</b>
                </li>
              );
            })}
          </ol>
        ) : null}
      </section>
    </section>
  );
}

function TouchHoldButton({
  ariaLabel,
  children,
  className,
  control,
  input,
}: {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  control: VirtualGamepadButton;
  input: VirtualGamepadController;
}) {
  const [pressed, setPressed] = useState(false);
  const activePointerId = useRef<number | null>(null);

  useEffect(
    function runEffect() {
      return function callback() {
        input.release(control);
      };
    },
    [control, input],
  );

  const release = (pointerId?: number) => {
    if (pointerId !== undefined && activePointerId.current !== pointerId) {
      return;
    }

    activePointerId.current = null;
    setPressed(false);
    input.release(control);
  };

  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      data-mobile-control={control}
      data-pressed={pressed || undefined}
      onPointerDown={function handlePointerDown(event) {
        event.preventDefault();
        activePointerId.current = event.pointerId;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Synthetic events used by interaction tests cannot always capture pointers.
        }
        setPressed(true);
        void primePokeLoungeAudio();
        input.press(control);
      }}
      onPointerUp={function handlePointerUp(event) {
        return release(event.pointerId);
      }}
      onPointerCancel={function handlePointerCancel(event) {
        return release(event.pointerId);
      }}
      onPointerLeave={function handlePointerLeave() {
        return release();
      }}
      onKeyDown={function handleKeyDown(event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setPressed(true);
          input.press(control);
        }
      }}
      onKeyUp={function handleKeyUp(event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          release();
        }
      }}
    >
      {children}
    </button>
  );
}
