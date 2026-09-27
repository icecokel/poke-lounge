"use client";

import { PageReloadButton } from "../ui/page-reload-button";
import { MoveLearningPanel } from "../runtime/game/ui/move-learning-panel";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
import { MobilePokemonCard, MobileItemRow, MobilePokemonThumbnail } from "./mobile-selection-cards";
import { Backpack, CircleDot, MessageSquare, Volume2, ChevronRight } from "lucide-react";
import { HgssItemIcon } from "../ui/hgss-item-icon";
import { MobilePlayStatus, MobileGameSummary } from "./mobile-play-status";
import { getMobileUiCopy } from "./mobile-ui-copy";
import { getRoomLobbyCopy } from "../runtime/game/ui/room-lobby-copy";
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
  lobby?: boolean;
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
  lobby = false,
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
      {!lobby ? (
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
            className="relative z-40 grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden border-t-2 border-[rgb(23_35_28_/_66%)] bg-[radial-gradient(circle_at_12%_20%,rgb(255_255_255_/_54%)_0_1px,transparent_1.5px),linear-gradient(180deg,#e9f1df_0%,#d6e5d1_100%)] bg-[length:12px_12px,auto] text-[#17201a] [container-name:poke-controller] [container-type:inline-size]"
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
        </>
      ) : null}
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
        lobby={lobby}
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
  return (
    <div
      className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] content-start gap-2 overflow-y-auto overscroll-contain bg-[#edf3e5] [background-image:var(--hg-stripes)] px-3 pt-2.5 pb-3 font-sans shadow-[inset_0_0_0_3px_#fffdf0,inset_0_0_0_5px_#b7c6af]"
      data-poke-lounge-mobile-deck="explore"
      data-poke-lounge-ui="heartgold"
    >
      {activePokemon ? (
        <div
          className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 rounded border-l-4 border-[var(--hg-accent)] bg-[#fffdf0] px-2.5 py-[5px] text-left tracking-normal [&_strong]:overflow-hidden [&_strong]:text-base [&_strong]:font-black [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-[#35513a] [&_span]:overflow-hidden [&_span]:text-sm [&_span]:font-extrabold [&_span]:text-ellipsis [&_span]:whitespace-nowrap [&_span]:text-[#4a5b4d]"
          data-poke-lounge-mobile-lead="true"
        >
          <strong>{activePokemon.name}</strong>
          <span>
            {formatMobileHp(activePokemon.currentHp, activePokemon.maxHp, activePokemon.status)}
          </span>
        </div>
      ) : null}
      <div className="mx-auto flex min-h-0 w-full max-w-[400px] items-center justify-between gap-3 self-start">
        <MobileDirectionalJoystick ariaLabel={copy.mobile.exploreDeckLabel} input={input} />
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          <TouchHoldButton
            control="confirm"
            className="col-span-2 flex min-h-16 touch-manipulation items-center justify-center gap-[5px] rounded-[9px] border-2 border-[var(--hg-ink)] bg-[linear-gradient(#d96950_50%,#ab4d3e_50%)] p-2 font-black text-[#fffdf4] shadow-[var(--hg-button)] data-[pressed=true]:translate-y-[3px] data-[pressed=true]:shadow-none [&>span]:text-base [&>span]:leading-[1.3] [&>span]:[overflow-wrap:anywhere] [&>small]:text-[0.64rem]"
            ariaLabel={copy.mobile.interact}
            input={input}
          >
            <MessageSquare size={24} aria-hidden="true" />
            <span>{copy.mobile.interact}</span>
          </TouchHoldButton>
          <TouchHoldButton
            control="bag"
            className="grid min-h-14 touch-manipulation content-center justify-items-center gap-[5px] rounded-[9px] border-2 border-[var(--hg-ink)] bg-[linear-gradient(#f9df86_50%,#dcbe68_50%)] p-2 font-black text-[#17201a] shadow-[var(--hg-button)] data-[pressed=true]:translate-y-[3px] data-[pressed=true]:shadow-none [&>span]:text-base [&>span]:leading-[1.3] [&>span]:[overflow-wrap:anywhere] [&>small]:text-[0.64rem]"
            ariaLabel={copy.mobile.bag}
            input={input}
          >
            <Backpack size={24} aria-hidden="true" />
            <span>{copy.mobile.bag}</span>
          </TouchHoldButton>
          <button
            type="button"
            className="grid min-h-14 touch-manipulation content-center justify-items-center gap-[5px] rounded-[9px] border-2 border-[var(--hg-ink)] bg-[linear-gradient(#b4d997_50%,#83b87b_50%)] p-2 font-black text-[#17201a] shadow-[var(--hg-button)] active:translate-y-[3px] active:shadow-none [&>span]:text-base [&>span]:leading-[1.3] [&>span]:[overflow-wrap:anywhere] [&>small]:text-[0.64rem]"
            onClick={function handleClick() {
              return onAction({ type: "open-party" });
            }}
            data-poke-lounge-mobile-party="true"
          >
            <CircleDot size={24} aria-hidden="true" />
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
      className="group/joystick relative isolate grid aspect-square w-[clamp(96px,36cqw,144px)] max-w-[42%] shrink-0 touch-none select-none place-items-center rounded-full border-[3px] border-[#17231c] bg-[radial-gradient(circle_at_center,#e9f1df_0_36%,#d6e5d1_37%_100%)] shadow-[inset_0_0_0_6px_rgb(248_251_240_/_42%),0_3px_0_#17231c] transition-[background,box-shadow] duration-120 before:pointer-events-none before:absolute before:inset-[16%] before:z-0 before:rounded-full before:border before:border-[rgb(23_35_28_/_36%)] before:content-[''] focus-visible:outline-3 focus-visible:outline-[#42713d] focus-visible:outline-offset-3 data-[active=true]:bg-[radial-gradient(circle_at_center,#f8fbf0_0_36%,#b7d897_37%_100%)]"
      role="group"
      tabIndex={0}
      aria-label={ariaLabel}
      data-active={isActive || undefined}
      data-direction={activeDirections.length > 0 ? activeDirections.join("-") : undefined}
      data-poke-lounge-mobile-joystick="true"
      onPointerDown={function handlePointerDown(event) {
        event.preventDefault();
        // Own one pointer until it is released. A second finger must not steal
        // the joystick or release the first finger's held directions.
        if (activePointerId.current !== null || event.button !== 0) return;
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
      onLostPointerCapture={function handleLostPointerCapture(event) {
        return release(event.pointerId);
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
        className="pointer-events-none absolute top-1/2 left-1/2 z-[1] aspect-square w-[42%] rounded-full border-[3px] border-[#17231c] bg-[#f8fbf0] shadow-[0_2px_0_#17231c] transition-[transform,background] duration-75 group-data-[active=true]/joystick:bg-[#b7d897]"
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
      className={cn(
        "absolute z-[100] grid min-h-0 w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[#edf3e5] [background-image:var(--hg-stripes)] text-[var(--hg-ink)] shadow-[var(--hg-frame)] [inset:var(--poke-lounge-mobile-letterbox-top)_0_var(--poke-lounge-mobile-letterbox-bottom)]",
        variant === "desktop" &&
          "top-1/2 left-1/2 z-[1] h-[min(78%,480px)] min-h-[300px] w-[min(70%,560px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border-[3px] border-[#17231c] shadow-[0_6px_0_rgb(23_35_28_/_76%)]",
      )}
      aria-labelledby="poke-lounge-mobile-world-scene-title"
      data-poke-lounge-ui="heartgold"
      data-poke-lounge-world-surface={state.screen}
    >
      <MobileWorldSceneHeader
        copy={copy}
        onClose={close}
        showClose={state.screen !== "inventory-move-replace"}
        title={state.title}
        walletPokeDollars={state.walletPokeDollars}
      />
      <div className="flex min-h-0 flex-col gap-3 overflow-auto overscroll-contain px-[max(16px,env(safe-area-inset-left))] pt-4 pb-3.5 [scroll-padding-block:12px]">
        {content}
      </div>
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
    <ul className="m-0 grid list-none gap-2.5 p-0 [&_li]:grid [&_li]:gap-1 [&_li]:rounded-xl [&_li]:border [&_li]:border-[rgb(53_81_58_/_52%)] [&_li]:bg-[rgb(248_251_240_/_86%)] [&_li]:p-3.5 [&_b]:text-[0.8rem] [&_b]:text-[#35513a] [&_span]:text-[0.72rem] [&_span]:leading-[1.35] [&_span]:font-bold [&_span]:text-[#4a5b4d]">
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
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3">
      <div className="grid min-h-0 grid-cols-2 content-start gap-[9px] overflow-auto overscroll-contain px-[3px] pt-[3px] pb-1.5">
        {state.items.map(function mapItem(item) {
          return (
            <PixelButton
              key={item.id}
              className="relative grid min-h-[104px] grid-rows-[minmax(42px,1fr)_auto] place-items-center gap-[7px] rounded-[7px] bg-[linear-gradient(#fffdf0_50%,#eee5c9_50%)] px-[7px] pt-2.5 pb-2 text-center"
              data-poke-lounge-inventory-item={item.id}
              selected={item.selected}
              onClick={function handleClick() {
                return onAction({ type: "select-inventory-item", index: item.index });
              }}
            >
              <HgssItemIcon id={item.id} />
              <span className="max-h-[2.3em] w-full overflow-hidden text-[0.68rem] leading-[1.15] whitespace-normal [overflow-wrap:anywhere]">
                {item.name}
              </span>
              <small className="absolute top-1.5 right-1.5 min-w-6 rounded-full border border-[var(--pl-color-ink)] bg-[var(--pl-color-surface-raised)] px-1 py-0.5 text-[0.58rem] leading-none text-[var(--pl-color-ink)]">
                ×{item.count}
              </small>
            </PixelButton>
          );
        })}
      </div>
      <div className="grid gap-[5px] border-t-2 border-[rgb(23_35_28_/_38%)] pt-2.5">
        <p className="m-0 px-0.5 text-[0.74rem] leading-[1.35] font-bold text-[#4a5b4d]">
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
      <p className="m-0 px-0.5 text-[0.74rem] leading-[1.35] font-bold text-[#4a5b4d]">
        {state.selectedItemName}
      </p>
      <div className="grid min-h-0 shrink-0 content-start gap-2">
        {state.party
          .filter(function filterItem(pokemon) {
            return !pokemon.isEmpty;
          })
          .map(function mapItem(pokemon) {
            return (
              <button
                key={pokemon.slotIndex}
                type="button"
                className="grid min-h-[54px] touch-manipulation grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-[11px] border-2 border-[#17231c] bg-[#f8fbf0] px-[11px] py-[9px] text-left font-black text-[#17201a] shadow-[0_2px_0_#17231c] active:translate-y-[3px] active:shadow-none data-[selected=true]:bg-[#fff1a8] disabled:cursor-default disabled:opacity-60 [&>span]:overflow-hidden [&>span]:text-[0.8rem] [&>span]:text-ellipsis [&>span]:whitespace-nowrap [&>small]:overflow-hidden [&>small]:text-[0.64rem] [&>small]:font-extrabold [&>small]:text-ellipsis [&>small]:whitespace-nowrap [&>small]:text-[#4a5b4d]"
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
  const selected = state.items.find(item => item.selected);
  return (
    <div className="grid min-w-0 shrink-0 content-start gap-3" data-poke-lounge-shop-panel="true">
      <div className="grid min-w-0 gap-2">
        {state.items.map(item => (
          <button
            key={item.id}
            type="button"
            className="grid min-h-[72px] touch-manipulation grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[7px] border-2 border-[#75949d] bg-[linear-gradient(#fffdf0_50%,#e6eef0_50%)] px-3 py-2.5 text-left text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#75949d] focus-visible:outline-3 focus-visible:outline-[#246b85] focus-visible:outline-offset-2 data-[selected=true]:border-[#a97630] data-[selected=true]:bg-[#fff0b9] data-[selected=true]:shadow-[inset_5px_0_0_#e9ab48,inset_0_0_0_2px_#fffdf0]"
            data-poke-lounge-shop-item={item.id}
            data-selected={item.selected}
            aria-pressed={item.selected}
            onClick={() => onAction({ type: "select-shop-item", index: item.index })}
          >
            <HgssItemIcon id={item.id} />
            <span className="grid min-w-0 gap-[3px] [overflow-wrap:anywhere] [&_strong]:text-base [&_small]:text-[0.8125rem] [&_small]:text-[#53676b]">
              <strong>{item.name}</strong>
              <small>×{item.count}</small>
            </span>
            <span className="rounded-[5px] border border-[#b6a571] bg-[#fff3bd] px-[7px] py-1 text-sm font-bold whitespace-nowrap tabular-nums text-[#675023]">
              {formatMobilePokeDollars(item.price ?? 0, copy.locale)}
            </span>
          </button>
        ))}
      </div>
      <div
        className="grid min-w-0 gap-x-3 gap-y-2 rounded-lg border-[3px] border-[#8b7950] bg-[#fffdf0] p-3 text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#c3d2c5] [&_p]:m-0 [&_p]:text-sm [&_p]:leading-[1.5] [&_p]:[overflow-wrap:anywhere]"
        data-poke-lounge-item-description="true"
      >
        {selected ? <strong>{selected.name}</strong> : null}
        <p>{state.selectedItemDescription || copy.game.noUsableItems}</p>
      </div>
      <MobileWorldMessage message={state.message} />
    </div>
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
  const selected = isPartyFocused
    ? state.party.find(slot => slot.slotIndex === state.selectedPartySlotIndex && !slot.isEmpty)
    : state.box.find(slot => slot.selected);
  return (
    <div className="grid min-w-0 shrink-0 content-start gap-3" data-poke-lounge-pc-panel="true">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="PC">
        <button
          type="button"
          className="min-h-12 touch-manipulation rounded-[7px] border-2 border-[#456778] bg-[#e1edf0] p-2 text-base font-black text-[#304550] shadow-[0_3px_0_#17231c] active:translate-y-[3px] active:shadow-none data-[selected=true]:bg-[linear-gradient(#5c93ad_50%,#3e708b_50%)] data-[selected=true]:text-[#fffdf0] data-[selected=true]:shadow-[inset_0_-4px_0_#efcb64]"
          data-selected={isPartyFocused}
          aria-pressed={isPartyFocused}
          onClick={() => onAction({ type: "select-pc-focus", focus: "party" })}
        >
          {copy.mobile.pcParty}
        </button>
        <button
          type="button"
          className="min-h-12 touch-manipulation rounded-[7px] border-2 border-[#456778] bg-[#e1edf0] p-2 text-base font-black text-[#304550] shadow-[0_3px_0_#17231c] active:translate-y-[3px] active:shadow-none data-[selected=true]:bg-[linear-gradient(#5c93ad_50%,#3e708b_50%)] data-[selected=true]:text-[#fffdf0] data-[selected=true]:shadow-[inset_0_-4px_0_#efcb64]"
          data-selected={!isPartyFocused}
          aria-pressed={!isPartyFocused}
          onClick={() => onAction({ type: "select-pc-focus", focus: "box" })}
        >
          {copy.mobile.pcBox}
        </button>
      </div>
      <div
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border-[3px] border-[#597681] bg-[#fffdf0] p-3 text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#c3d2c5] [&>div]:min-w-0 [&>div]:flex-1 [&>div]:[overflow-wrap:anywhere] [&_p]:m-0 [&_p]:text-sm [&_p]:leading-[1.5] [&_p]:[overflow-wrap:anywhere]"
        data-poke-lounge-pc-selection="true"
      >
        {selected ? (
          <>
            <MobilePokemonThumbnail sprite={selected.sprite} />
            <div>
              <strong>{selected.name}</strong>
              <p>
                Lv.{selected.level} · HP {formatMobileHp(selected.currentHp, selected.maxHp, null)}
              </p>
            </div>
          </>
        ) : (
          <p>{copy.game.empty}</p>
        )}
      </div>
      <div
        className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,88px),1fr))] gap-[9px] rounded-lg border-[3px] border-[#6d929b] bg-[#c2ded7] bg-[linear-gradient(#fffdf044_1px,transparent_1px),linear-gradient(90deg,#fffdf044_1px,transparent_1px)] bg-[length:20px_20px] p-3 shadow-[inset_0_0_0_2px_#f4fae9]"
        data-poke-lounge-pc-grid="true"
      >
        {isPartyFocused ? (
          state.party.map(pokemon => (
            <button
              key={pokemon.slotIndex}
              type="button"
              className="relative flex min-h-[108px] min-w-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-[7px] border-2 border-[#779a8f] bg-[#f0f7e6] px-1.5 py-2 text-center text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0] focus-visible:outline-3 focus-visible:outline-[#246b85] focus-visible:outline-offset-2 data-[empty=true]:border-dashed data-[empty=true]:bg-[#d5e7d9] data-[fainted=true]:bg-[#ebd7cf] data-[selected=true]:border-[#ab7334] data-[selected=true]:bg-[#fff0ba] data-[selected=true]:shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#8e6a36] [&_strong]:max-w-full [&_strong]:text-sm [&_strong]:leading-[1.3] [&_strong]:[overflow-wrap:anywhere] [&_small]:text-xs"
              data-poke-lounge-pc-party-slot={pokemon.slotIndex}
              data-selected={pokemon.slotIndex === state.selectedPartySlotIndex}
              data-empty={pokemon.isEmpty || undefined}
              data-fainted={pokemon.currentHp === 0 || undefined}
              aria-pressed={pokemon.slotIndex === state.selectedPartySlotIndex}
              onClick={() => onAction({ type: "select-pc-party", slotIndex: pokemon.slotIndex })}
            >
              <span
                className="absolute top-1 left-[5px] font-mono text-[10px] leading-[1.3] font-bold text-[#657c7d]"
                aria-hidden="true"
              >
                {String(pokemon.slotIndex + 1).padStart(2, "0")}
              </span>
              {pokemon.isEmpty ? (
                <span
                  className="grid size-14 place-items-center text-2xl text-[#7a9a8a]"
                  aria-hidden="true"
                >
                  ＋
                </span>
              ) : (
                <MobilePokemonThumbnail sprite={pokemon.sprite} />
              )}
              <strong>
                {pokemon.isEmpty ? copy.partySlotLabel(pokemon.slotIndex + 1) : pokemon.name}
              </strong>
              <small>{pokemon.isEmpty ? copy.partySlotEmpty : `Lv.${pokemon.level}`}</small>
            </button>
          ))
        ) : state.box.length ? (
          state.box.map(pokemon => (
            <button
              key={pokemon.boxIndex}
              type="button"
              className="relative flex min-h-[108px] min-w-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-[7px] border-2 border-[#779a8f] bg-[#f0f7e6] px-1.5 py-2 text-center text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0] focus-visible:outline-3 focus-visible:outline-[#246b85] focus-visible:outline-offset-2 data-[empty=true]:border-dashed data-[empty=true]:bg-[#d5e7d9] data-[fainted=true]:bg-[#ebd7cf] data-[selected=true]:border-[#ab7334] data-[selected=true]:bg-[#fff0ba] data-[selected=true]:shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#8e6a36] [&_strong]:max-w-full [&_strong]:text-sm [&_strong]:leading-[1.3] [&_strong]:[overflow-wrap:anywhere] [&_small]:text-xs"
              data-poke-lounge-pc-box-slot={pokemon.boxIndex}
              data-selected={pokemon.selected}
              data-fainted={pokemon.currentHp === 0 || undefined}
              aria-pressed={pokemon.selected}
              onClick={() => onAction({ type: "select-pc-box", boxIndex: pokemon.boxIndex })}
            >
              <span
                className="absolute top-1 left-[5px] font-mono text-[10px] leading-[1.3] font-bold text-[#657c7d]"
                aria-hidden="true"
              >
                {String(pokemon.boxIndex + 1).padStart(2, "0")}
              </span>
              <MobilePokemonThumbnail sprite={pokemon.sprite} />
              <strong>{pokemon.name}</strong>
              <small>Lv.{pokemon.level}</small>
            </button>
          ))
        ) : (
          <p className="col-span-full p-5 text-center text-[#49665e]">{copy.game.empty}</p>
        )}
      </div>
      <MobileWorldMessage message={state.message} />
    </div>
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
          <p className="m-0 text-[0.62rem] font-black text-[#4a5b4d]">
            {copy.game.diceTargetAndBet(
              state.dice.targetNumber,
              formatMobilePokeDollars(state.dice.stakePokeDollars, copy.locale),
            )}
          </p>
          <div className="grid min-h-0 shrink-0 content-start gap-2">
            {state.dice.options.map(function mapItem(option) {
              return (
                <button
                  key={option.prediction}
                  type="button"
                  className="grid min-h-[54px] touch-manipulation grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-[11px] border-2 border-[#17231c] bg-[#f8fbf0] px-[11px] py-[9px] text-left font-black text-[#17201a] shadow-[0_2px_0_#17231c] active:translate-y-[3px] active:shadow-none data-[selected=true]:bg-[#fff1a8] disabled:cursor-default disabled:opacity-60 [&>span]:overflow-hidden [&>span]:text-[0.8rem] [&>span]:text-ellipsis [&>span]:whitespace-nowrap [&>small]:overflow-hidden [&>small]:text-[0.64rem] [&>small]:font-extrabold [&>small]:text-ellipsis [&>small]:whitespace-nowrap [&>small]:text-[#4a5b4d]"
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
    <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-2">
      {state.party
        .filter(pokemon => !pokemon.isEmpty)
        .map(pokemon => (
          <MobilePokemonCard
            key={pokemon.slotIndex}
            copy={copy}
            pokemon={pokemon}
            slotIndex={pokemon.slotIndex}
            purpose="party"
            selected={pokemon.isActive}
            badge={pokemon.isActive ? copy.partySlotLead : undefined}
            disabled={!pokemon.canSetAsLead}
            onSelect={() => onAction({ type: "set-party-lead", slotIndex: pokemon.slotIndex })}
          />
        ))}
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
    <header className="grid min-h-[62px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-b-[3px] border-[#304550] bg-[linear-gradient(#d8e9ee_50%,#fffdf0_50%)] px-[max(14px,env(safe-area-inset-left))] py-2">
      {showClose ? (
        <button
          type="button"
          className="inline-flex min-h-10 touch-manipulation items-center gap-[3px] rounded-[10px] border-2 border-[#17231c] bg-[#f8fbf0] px-2.5 py-1.5 text-[0.7rem] font-black text-[#17201a] shadow-[0_2px_0_#17231c] active:translate-y-[3px] active:shadow-none [&>:first-child]:text-[1.35rem] [&>:first-child]:leading-[0.6]"
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
      <strong
        id="poke-lounge-mobile-world-scene-title"
        className="overflow-hidden text-center text-base font-black text-ellipsis whitespace-nowrap text-[#35513a]"
      >
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
    <footer className="grid grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] gap-2.5 border-t-[3px] border-[#304550] bg-[#fffdf0] px-[max(16px,env(safe-area-inset-left))] pt-2.5 pb-3">
      <button
        type="button"
        className="min-h-12 touch-manipulation rounded-[7px] border-2 border-[#456778] bg-[#e1edf0] p-2 text-base font-black text-[#304550] shadow-[0_3px_0_#17231c] active:translate-y-[3px] active:shadow-none data-[selected=true]:bg-[linear-gradient(#5c93ad_50%,#3e708b_50%)] data-[selected=true]:text-[#fffdf0] data-[selected=true]:shadow-[inset_0_-4px_0_#efcb64]"
        onClick={onBack}
      >
        ‹ {backLabel ?? copy.mobile.back}
      </button>
      <button
        type="button"
        className="min-h-12 touch-manipulation rounded-[11px] border-2 border-[#17231c] bg-[#e57a55] px-2.5 py-2 text-[0.76rem] font-black text-[#fffdf4] shadow-[0_3px_0_#17231c] active:translate-y-[3px] active:shadow-none disabled:opacity-60"
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
    <p className="m-0 max-w-[104px] text-right text-[0.62rem] font-black text-[#4a5b4d]">
      {copy.mobile.wallet} · {formatMobilePokeDollars(value, copy.locale)}
    </p>
  );
}

function MobileWorldMessage({ message }: { message: string }) {
  return message ? (
    <p className="m-0 rounded-lg border-[3px] border-[#304550] bg-[#fffdf0] px-3.5 py-3 text-sm leading-[1.5] font-extrabold text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1]">
      {message}
    </p>
  ) : null;
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
  lobby = false,
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
  lobby?: boolean;
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
      <div className="grid gap-3 [&>button]:h-auto [&>button]:min-h-14 [&>button]:whitespace-normal [&>button]:text-base">
        <button
          type="button"
          className="min-h-14 w-full touch-manipulation rounded-lg border-2 border-[#304550] bg-[linear-gradient(#5c9268_50%,#3a694c_50%)] px-3 py-2 font-bold text-white shadow-[var(--hg-button)] focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 disabled:cursor-default disabled:border-[#8d9c98] disabled:bg-[#d8e0d6] disabled:text-[#536164] disabled:shadow-[inset_0_0_0_2px_#eef0e8]"
          onClick={onClose}
        >
          {lobby
            ? getRoomLobbyCopy(copy.locale).returnToLobby
            : getMobileUiCopy(copy.locale).returnToGame}
        </button>
        <Button
          type="button"
          variant="outline"
          onClick={onVolumeCycle}
          aria-label={volumeAriaLabel}
          className="h-auto min-h-14 justify-between gap-3 whitespace-normal rounded-[7px] border-2 border-[#78909b] bg-[linear-gradient(#fffdf0_50%,#e4edf0_50%)] px-4 py-3 text-left text-base text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#536d79] hover:bg-[linear-gradient(#fffdf0_50%,#e4edf0_50%)] hover:text-[#304550] [&>span]:min-w-0 [&>span]:flex-1"
          data-poke-lounge-setting-action="volume"
        >
          <Volume2 size={22} aria-hidden="true" />
          <span>{volumeLabel}</span>
          <ChevronRight size={20} aria-hidden="true" />
        </Button>
        <PageReloadButton locale={copy.locale} confirmBeforeReload />
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
        <div
          className="grid gap-2 rounded-[7px] border-2 border-[#82989d] bg-[repeating-linear-gradient(0deg,#f4f8ed_0_24px,#e8efe3_24px_48px)] p-4 text-sm whitespace-pre-line shadow-[inset_0_0_0_2px_#fffdf0]"
          aria-live="polite"
        >
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
          className="min-h-14 w-full touch-manipulation rounded-lg border-2 border-[#543e38] bg-[linear-gradient(#ac5748_50%,#864033_50%)] px-3 py-2 font-bold text-white shadow-[var(--hg-button)] focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 disabled:cursor-default disabled:border-[#8d9c98] disabled:bg-[#d8e0d6] disabled:text-[#536164]"
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
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-2">
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
        {!items.length ? (
          <p className="rounded-[10px] border border-[#a6b69d] bg-[#fffef5] p-4">{text.noItems}</p>
        ) : null}
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
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-2">
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
      className="[&_button]:min-h-14 [&_button_span]:text-base [&_button_span]:whitespace-normal [&_button_small]:text-sm [&_p]:text-sm [&_p]:whitespace-pre-line [&_li]:bg-[#fffef5] [&_li_b]:text-base [&_li_span]:text-sm"
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
            {summary ? (
              <p className="border-l-4 border-[var(--hg-accent)] pl-2.5 text-sm text-[var(--hg-ink)] [overflow-wrap:anywhere]">
                {summary}
              </p>
            ) : null}
            <button
              type="button"
              className="min-h-14 w-full touch-manipulation rounded-lg border-2 border-[#304550] bg-[linear-gradient(#5c9268_50%,#3a694c_50%)] px-3 py-2 font-bold text-white shadow-[var(--hg-button)] focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 disabled:cursor-default disabled:border-[#8d9c98] disabled:bg-[#d8e0d6] disabled:text-[#536164] disabled:shadow-[inset_0_0_0_2px_#eef0e8]"
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
