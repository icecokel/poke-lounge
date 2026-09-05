"use client";

import { MoveLearningPanel } from "../runtime/game/ui/move-learning-panel";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import type { PokeLoungeCopy } from "../poke-lounge-copy";
import { PixelButton } from "../ui/poke-lounge-ui-primitives";
import { primePokeLoungeAudio } from "../runtime/game/audio/poke-lounge-audio";

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
import uiStyles from "./mobile-ui.module.css";
import { MobileBattleDeck } from "./mobile-battle-deck";
export {
  MobileBattleDeck,
  MobileBattleCommandDeck,
  MobileBattleMoveDeck,
  MobileBattlePartyDeck,
  MobileBattleBagDeck,
  MobileBattleHelpDeck,
  MobileBattleMessageDeck,
  MobileBattleWaitingDeck,
} from "./mobile-battle-deck";
import { MobileTaskScreen } from "./mobile-task-screen";
import { MobilePokemonCard, MobileItemRow } from "./mobile-selection-cards";
import { MobilePlayStatus, MobileGameSummary } from "./mobile-play-status";
import { getMobileUiCopy } from "./mobile-ui-copy";
import type { GameStateStore } from "../runtime/game/state/game-state-store";
import { localizeMobileWorldUiState } from "../runtime/game/i18n/runtime-game-localization";

type MobileScene = "battle" | "world" | null;

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
  open: boolean;
  partySlots: PokeLoungePartySlotSummary[];
  roomShareAvailable: boolean;
  roomShareStatus: "idle" | "success" | "error";
  roomLeaveLabel: string | null;
  volumeAriaLabel: string;
  volumeLabel: string;
}

export interface MobileGameShellProps {
  gameStateStore?: GameStateStore;
  competitive?: boolean;
  activeScene: MobileScene;
  battleUiStore?: BattleUiStore;
  copy: PokeLoungeCopy;
  onOpenSettings(): void;
  settings: MobileSettingsProps;
  worldInput?: VirtualGamepadController;
  worldUiStore?: WorldUiStore;
}

export function MobileGameShell({
  gameStateStore,
  competitive = false,
  activeScene,
  battleUiStore,
  copy,
  onOpenSettings,
  settings,
  worldInput = virtualGamepadController,
  worldUiStore,
}: MobileGameShellProps) {
  const rawWorldState = useSyncExternalStore(
    worldUiStore?.subscribe ?? subscribeToNothing,
    function callback() {
      return worldUiStore?.getSnapshot().mobile ?? null;
    },
    function callback() {
      return null;
    },
  );
  const worldState = rawWorldState ? localizeMobileWorldUiState(rawWorldState, copy.locale) : null;

  const battleControls = useSyncExternalStore(
    battleUiStore?.subscribe ?? subscribeToNothing,
    () => battleUiStore?.getSnapshot().controls ?? null,
    () => null,
  );
  const sceneContext = `${activeScene}:${activeScene === "battle" ? (battleControls?.selectionKey ?? battleControls?.phase) : "world"}`;
  const previousContext = useRef(sceneContext);
  const { open: settingsOpen, onClose: closeSettings } = settings;
  useEffect(() => {
    if (previousContext.current !== sceneContext && settingsOpen) closeSettings();
    previousContext.current = sceneContext;
  }, [sceneContext, settingsOpen, closeSettings]);

  const dispatchWorldAction = (action: MobileWorldUiAction) => {
    worldInput.reset();
    void primePokeLoungeAudio();
    worldUiStore?.dispatch(action);
  };
  const isWorldSceneOpen = activeScene === "world" && worldState && worldState.screen !== "explore";
  const activePokemon = worldState?.party.find(pokemon => pokemon.isActive && !pokemon.isEmpty);
  const openHelp = () => {
    settings.onClose();
    if (activeScene === "world") dispatchWorldAction({ type: "open-help" });
    else {
      resetVirtualGamepad();
      battleUiStore?.dispatch({ type: "toggle-help" });
    }
  };
  return (
    <>
      <MobilePlayStatus
        copy={copy}
        gameStateStore={gameStateStore}
        battleUiStore={battleUiStore}
        competitive={competitive}
        activeScene={activeScene}
        onMenu={() => {
          worldInput.reset();
          resetVirtualGamepad();
          onOpenSettings();
        }}
      />
      <section
        className={styles.shell}
        aria-label={
          activeScene === "battle" ? copy.mobile.battleDeckLabel : copy.mobile.exploreDeckLabel
        }
        data-poke-lounge-mobile-control-dock="true"
      >
        {activeScene === "battle" ? (
          <MobileBattleDeck copy={copy} uiStore={battleUiStore} />
        ) : (
          <MobileExploreDeck
            copy={copy}
            input={worldInput}
            onAction={dispatchWorldAction}
            activePokemon={activePokemon}
          />
        )}
      </section>
      {isWorldSceneOpen ? (
        <MobileWorldScreen
          copy={copy}
          onAction={dispatchWorldAction}
          state={worldState}
          gameStateStore={gameStateStore}
          competitive={competitive}
        />
      ) : null}
      <MobileSettingsScreen
        copy={copy}
        {...settings}
        onOpenHelp={activeScene ? openHelp : undefined}
        gameStateStore={gameStateStore}
        competitive={competitive}
      />
    </>
  );
}

function MobileExploreDeck({
  activePokemon,
  copy,
  input,
  onAction,
}: {
  copy: PokeLoungeCopy;
  input: VirtualGamepadController;
  activePokemon?: PokeLoungePartySlotSummary;
  onAction(action: MobileWorldUiAction): void;
}) {
  const layoutRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const deck = layoutRef.current;
    const page = deck?.closest<HTMLElement>("[data-testid='poke-lounge-page']");
    if (!deck || !page) return;
    const previous = page.style.getPropertyValue("--poke-lounge-mobile-dock-min-height");
    const measure = () => {
      const children = Array.from(deck.children).filter(
        (node): node is HTMLElement => node instanceof HTMLElement,
      );
      const css = getComputedStyle(deck);
      const height =
        children.reduce((sum, child) => sum + child.scrollHeight, 0) +
        Number.parseFloat(css.paddingTop) +
        Number.parseFloat(css.paddingBottom) +
        Number.parseFloat(css.rowGap) * Math.max(0, children.length - 1) +
        4;
      page.style.setProperty(
        "--poke-lounge-mobile-dock-min-height",
        `${Math.max(224, Math.ceil(height))}px`,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(deck);
    for (const child of Array.from(deck.children)) observer.observe(child);
    measure();
    return () => {
      observer.disconnect();
      if (previous) page.style.setProperty("--poke-lounge-mobile-dock-min-height", previous);
      else page.style.removeProperty("--poke-lounge-mobile-dock-min-height");
    };
  }, [activePokemon?.slotIndex]);
  return (
    <div ref={layoutRef} className={styles.exploreDeck} data-poke-lounge-mobile-deck="explore">
      {activePokemon ? (
        <div className={styles.activePokemon} data-poke-lounge-mobile-lead="true">
          <strong>{activePokemon.name}</strong>
          <span>
            {formatMobileHp(activePokemon.currentHp, activePokemon.maxHp, activePokemon.status)}
          </span>
        </div>
      ) : null}
      <div className={styles.controlCluster}>
        <MobileDirectionalJoystick ariaLabel={copy.mobile.exploreDeckLabel} input={input} />
        <div className={styles.fieldActions}>
          <TouchHoldButton
            control="confirm"
            className={styles.primaryAction}
            ariaLabel={copy.mobile.interact}
            input={input}
          >
            <span>{copy.mobile.interact}</span>
          </TouchHoldButton>
          <TouchHoldButton
            control="bag"
            className={styles.secondaryAction}
            ariaLabel={copy.mobile.bag}
            input={input}
          >
            <span>{copy.mobile.bag}</span>
          </TouchHoldButton>
          <button
            type="button"
            className={styles.partyAction}
            onClick={function handleClick() {
              return onAction({ type: "open-party" });
            }}
            data-poke-lounge-mobile-party="true"
          >
            <span>{copy.mobile.party}</span>
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
  gameStateStore,
  competitive = false,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileWorldUiAction): void;
  state: MobileWorldUiState;
  variant?: "desktop" | "mobile";
  gameStateStore?: GameStateStore;
  competitive?: boolean;
}) {
  if (variant === "mobile")
    return (
      <MobileWorldTask
        copy={copy}
        state={state}
        onAction={onAction}
        gameStateStore={gameStateStore}
        competitive={competitive}
      />
    );
  const close = () => onAction({ type: "close" });
  const back = () => onAction({ type: "back" });
  let content: ReactNode;
  let footer: ReactNode = null;

  if (state.screen === "help") {
    content = <MobileWorldHelpScreen copy={copy} state={state} />;
  } else if (state.screen === "inventory-items") {
    content = <MobileInventoryItemList copy={copy} onAction={onAction} state={state} />;
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
    footer = null;
  } else if (state.screen === "shop") {
    content = <MobileShopPanel copy={copy} onAction={onAction} state={state} />;
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
    content = <MobileDicePanel copy={copy} onAction={onAction} state={state} />;
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

export function MobileWorldHelpScreen({
  copy,
  state,
}: {
  copy: PokeLoungeCopy;
  state: MobileWorldUiState;
}) {
  return (
    <ul className={styles.helpList}>
      {createShortcutGuideRows("world", state.inputMode, copy.locale).map(function mapItem(row) {
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
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
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
          {state.selectedItemDescription || copy.game.noUsableItems}
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
  if (!state.moveReplacement)
    return <MobileWorldMessage message={copy.game.moveReplacementUnavailable} />;
  return (
    <MoveLearningPanel
      copy={copy}
      pending={state.moveReplacement}
      moves={state.moveReplacement.moves}
      onSelect={function chooseMove(index) {
        onAction({ type: "select-inventory-move", index });
      }}
      onConfirm={function approveMove() {
        onAction({ type: "confirm-inventory-move" });
      }}
      onCancel={function cancelMove() {
        onAction({ type: "back" });
      }}
      onSkip={function skipMove() {
        onAction({ type: "skip-inventory-move" });
      }}
    />
  );
}

export function MobileShopPanel({
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
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
                {formatMobilePokeDollars(item.price ?? 0, copy.locale)} · ×{item.count}
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
          <p className={styles.emptyList}>{copy.game.empty}</p>
        )}
      </div>
      <MobileWorldMessage message={state.message} />
    </>
  );
}

export function MobileDicePanel({
  copy,
  onAction,
  state,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileWorldUiAction): void;
  state: MobileWorldUiState;
}) {
  return (
    <>
      {state.dice ? (
        <>
          <p className={styles.diceMeta}>
            {copy.game.diceTargetAndBet(
              state.dice.targetNumber,
              formatMobilePokeDollars(state.dice.stakePokeDollars, copy.locale),
            )}
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
                    {formatMobilePokeDollars(option.rewardPokeDollars, copy.locale)}
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
      {copy.mobile.wallet} · {formatMobilePokeDollars(value, copy.locale)}
    </p>
  );
}

function MobileWorldMessage({ message }: { message: string }) {
  return message ? <p className={styles.deckMessage}>{message}</p> : null;
}

function formatMobilePokeDollars(value: number, locale: string): string {
  return `₽ ${Math.max(0, Math.floor(value)).toLocaleString(locale)}`;
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

function MobileSettingsScreen({
  copy,
  open,
  onClose,
  onOpenHelp,
  onExit,
  onVolumeCycle,
  volumeAriaLabel,
  volumeLabel,
  roomShareAvailable,
  onRoomShare,
  roomShareStatus,
  localRoomShare,
  hydrationFallbackMessage,
  onRetryHydration,
  hydrationRetryDisabled,
  hydrationRetryLabel,
  connectionLabel,
  autosaveLabel,
  roomLeaveLabel,
  gameStateStore,
  competitive,
}: MobileSettingsProps & {
  copy: PokeLoungeCopy;
  onOpenHelp?: () => void;
  gameStateStore?: GameStateStore;
  competitive?: boolean;
}) {
  if (!open) return null;
  return (
    <MobileTaskScreen
      title={copy.settingsTitle}
      name="settings"
      backLabel={copy.settingsClose}
      onBack={onClose}
      returnFocusSelector="[data-poke-lounge-mobile-menu='true']"
    >
      <div className={uiStyles.settingsList}>
        <button type="button" className={uiStyles.primaryButton} onClick={onClose}>
          {getMobileUiCopy(copy.locale).returnToGame}
        </button>
        <Button
          type="button"
          variant="outline"
          onClick={onVolumeCycle}
          aria-label={volumeAriaLabel}
        >
          {volumeLabel}
        </Button>
        {onOpenHelp ? (
          <Button
            type="button"
            variant="outline"
            onClick={onOpenHelp}
            data-poke-lounge-mobile-help="true"
          >
            {copy.mobile.help}
          </Button>
        ) : null}
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
        <MobileGameSummary
          copy={copy}
          gameStateStore={gameStateStore}
          competitive={competitive}
          detail
        />
        <div className={uiStyles.settingsStatus} aria-live="polite">
          <span>{connectionLabel}</span>
          <span>{autosaveLabel}</span>
          {hydrationFallbackMessage ? (
            <span data-testid="poke-lounge-state-hydration-local-fallback">
              {hydrationFallbackMessage}
            </span>
          ) : null}
        </div>
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
        <button
          type="button"
          className={uiStyles.dangerButton}
          onClick={onExit}
          data-poke-lounge-mobile-game-exit="true"
          data-room-leave={roomLeaveLabel ? "true" : undefined}
        >
          {roomLeaveLabel ?? copy.settingsExit}
        </button>
      </div>
    </MobileTaskScreen>
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

function MobileWorldTask({
  copy,
  state,
  onAction,
  gameStateStore,
  competitive,
}: {
  copy: PokeLoungeCopy;
  state: MobileWorldUiState;
  onAction(action: MobileWorldUiAction): void;
  gameStateStore?: GameStateStore;
  competitive?: boolean;
}) {
  const text = getMobileUiCopy(copy.locale);
  const item = state.items.find(candidate => candidate.selected);
  const pokemon = state.party.find(
    candidate => candidate.slotIndex === state.selectedPartySlotIndex && !candidate.isEmpty,
  );
  const hasWallet = state.screen === "shop" || state.screen === "dice";
  let body: ReactNode;
  let confirm: (() => void) | undefined;
  let confirmLabel = "";
  let summary = "";
  let disabled = false;
  const goBack =
    state.screen === "inventory-party"
      ? () => onAction({ type: "back" })
      : () => onAction({ type: "close" });
  if (state.screen === "inventory-items") {
    const items = state.items.filter(option => option.count > 0);
    body = (
      <>
        <div className={uiStyles.cardList}>
          {items.map(option => (
            <MobileItemRow
              key={option.id}
              purpose="inventory"
              id={option.id}
              name={option.name}
              count={option.count}
              description={option.description}
              selected={option.selected}
              disabled={option.disabled}
              onSelect={() => onAction({ type: "select-inventory-item", index: option.index })}
            />
          ))}
        </div>
        {!items.length ? <p className={uiStyles.emptyNotice}>{text.noItems}</p> : null}
        <MobileWorldMessage message={state.message} />
      </>
    );
    confirm = () => onAction({ type: "use-inventory-item" });
    confirmLabel = copy.mobile.use;
    summary = item?.name ?? text.chooseItem;
    disabled = !item || item.disabled || item.count <= 0;
  } else if (state.screen === "inventory-party" || state.screen === "party") {
    const party = state.party.filter(slot => !slot.isEmpty);
    body = (
      <>
        <div className={uiStyles.cardList}>
          {party.map(slot => (
            <MobilePokemonCard
              key={slot.slotIndex}
              copy={copy}
              pokemon={slot}
              slotIndex={slot.slotIndex}
              purpose={state.screen === "party" ? "party" : "inventory"}
              selected={
                state.screen === "party"
                  ? slot.isActive
                  : slot.slotIndex === state.selectedPartySlotIndex
              }
              badge={slot.isActive ? copy.partySlotLead : undefined}
              disabled={state.screen === "party" && !slot.canSetAsLead}
              reason={
                state.screen === "party" && !slot.isActive
                  ? slot.canSetAsLead
                    ? copy.mobile.setLead
                    : copy.game.leadUnavailable
                  : undefined
              }
              onSelect={() =>
                onAction(
                  state.screen === "party"
                    ? { type: "set-party-lead", slotIndex: slot.slotIndex }
                    : { type: "select-inventory-party", slotIndex: slot.slotIndex },
                )
              }
            />
          ))}
        </div>
        <MobileWorldMessage message={state.message} />
      </>
    );
    if (state.screen === "inventory-party") {
      confirm = () => onAction({ type: "use-inventory-item" });
      confirmLabel = copy.mobile.use;
      summary = `${state.selectedItemName} · ${pokemon?.name ?? text.missing}`;
      disabled = !pokemon;
    }
  } else if (state.screen === "inventory-move-replace") {
    body = <MobileInventoryMoveReplacement copy={copy} state={state} onAction={onAction} />;
  } else if (state.screen === "shop") {
    body = <MobileShopPanel copy={copy} state={state} onAction={onAction} />;
    confirm = () => onAction({ type: "purchase-shop-item" });
    confirmLabel = copy.mobile.buy;
    summary = item?.name ?? "";
    disabled =
      !item || item.disabled || (item.price != null && item.price > state.walletPokeDollars);
  } else if (state.screen === "pc") {
    body = <MobilePcPanel copy={copy} state={state} onAction={onAction} />;
    confirm = () => onAction({ type: "confirm-pc-selection" });
    confirmLabel = state.pcFocus === "party" ? copy.mobile.deposit : copy.mobile.withdraw;
    disabled = state.pcFocus === "party" ? !pokemon : !state.box.some(slot => slot.selected);
  } else if (state.screen === "dice") {
    body = <MobileDicePanel copy={copy} state={state} onAction={onAction} />;
    confirm = () => onAction({ type: "confirm-dice-selection" });
    confirmLabel = copy.mobile.roll;
    disabled = !state.dice?.options.some(option => option.selected && !option.disabled);
  } else {
    body = <MobileWorldHelpScreen copy={copy} state={state} />;
  }
  return (
    <MobileTaskScreen
      title={state.title}
      name={`world-${state.screen}`}
      className={uiStyles.worldTask}
      backLabel={copy.mobile.back}
      onBack={state.screen === "inventory-move-replace" ? undefined : goBack}
      returnFocusSelector={
        state.screen === "help"
          ? "[data-poke-lounge-mobile-menu='true']"
          : state.screen === "party"
            ? "[data-poke-lounge-mobile-party='true']"
            : "[data-mobile-control='bag']"
      }
      context={
        hasWallet || competitive ? (
          <>
            {hasWallet ? (
              <span>
                {copy.mobile.wallet} ·{" "}
                {formatMobilePokeDollars(state.walletPokeDollars, copy.locale)}
              </span>
            ) : null}
            {competitive ? (
              <MobileGameSummary copy={copy} gameStateStore={gameStateStore} competitive />
            ) : null}
          </>
        ) : undefined
      }
      footer={
        confirm ? (
          <>
            {summary ? <p className={uiStyles.selectionSummary}>{summary}</p> : null}
            <button
              type="button"
              className={uiStyles.primaryButton}
              onClick={confirm}
              disabled={disabled}
            >
              {confirmLabel}
            </button>
          </>
        ) : undefined
      }
    >
      {body}
    </MobileTaskScreen>
  );
}
