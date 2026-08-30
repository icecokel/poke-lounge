import { getPokeLoungeCopyForUrl, type PokeLoungeCopy } from "../../../poke-lounge-copy";
import { playPokeLoungeSfx, primePokeLoungeAudio } from "../audio/poke-lounge-audio";
import {
  deriveTemporaryRoomCode,
  normalizeTemporaryPassword,
  type RoomEntryMode,
  type RoomRoundDurationMs,
} from "./roomEntry";

const MAX_MULTIPLAYER_DISPLAY_NAME_LENGTH = 12;
const MULTIPLAYER_DISPLAY_NAME_INPUT_ID = "poke-lounge-multiplayer-display-name";
const TEMPORARY_PASSWORD_INPUT_ID = "poke-lounge-temporary-password";
const NEW_GAME_DIALOG_TITLE_ID = "poke-lounge-new-game-dialog-title";
const NEW_GAME_DIALOG_DESCRIPTION_ID = "poke-lounge-new-game-dialog-description";

export interface RoomEntrySelection {
  mode: Exclude<RoomEntryMode, "unset">;
  roomCode: string | null;
  inviteUrl: string | null;
  displayName?: string;
  createRoom?: boolean;
  roundDurationMs?: RoomRoundDurationMs;
  resetSession?: boolean;
}

export function shouldResetRoomEntrySession(selection: RoomEntrySelection): boolean {
  return selection.mode === "solo" && selection.resetSession === true;
}

export interface RoomEntryScreenOptions {
  currentUrl: URL;
  initialDisplayName?: string;
  localTestMode?: {
    active: boolean;
    onExit(): void;
    onStart(): void;
  };
  onSelect(selection: RoomEntrySelection): void;
}

export interface DirectMultiplayerEntryScreenOptions {
  currentUrl: URL;
  initialDisplayName?: string;
  onSubmit(displayName: string): void;
}

export function renderDirectMultiplayerEntryScreen(
  mount: HTMLElement,
  options: DirectMultiplayerEntryScreenOptions,
): HTMLElement {
  mount.innerHTML = "";

  const copy = getPokeLoungeCopyForUrl(options.currentUrl);
  const screen = document.createElement("section");
  screen.className = "room-entry-screen";
  screen.setAttribute("data-room-entry-direct-multiplayer", "true");

  const panel = document.createElement("div");
  panel.className = "room-entry-panel";
  const title = document.createElement("h1");
  title.textContent = copy.roomEntry.multiplayerEntryTitle;
  const fanNotice = createFanNotice(copy);
  const message = createMessage();
  const displayNameInput = createMultiplayerDisplayNameInput(
    options.initialDisplayName,
    copy.roomEntry,
  );
  displayNameInput.setAttribute("data-room-entry-direct-multiplayer-name", "true");
  const displayNameDescription = document.createElement("p");
  displayNameDescription.className = "room-entry-field-copy";
  displayNameDescription.textContent = copy.roomEntry.multiplayerNameDescription;
  const displayNameField = createLabeledField(
    copy.roomEntry.multiplayerNameLabel,
    MULTIPLAYER_DISPLAY_NAME_INPUT_ID,
    displayNameInput,
    displayNameDescription,
  );
  displayNameField.classList.add("room-entry-multiplayer-name");

  const submit = () => {
    const displayName = getMultiplayerDisplayName(
      displayNameInput,
      message,
      copy.roomEntry.multiplayerNameRequired,
    );
    if (!displayName) {
      return;
    }
    playRoomEntryConfirmSound();
    message.textContent = "";
    options.onSubmit(displayName);
  };
  const submitButton = createButton(
    copy.roomEntry.multiplayerEntrySubmit,
    "data-room-entry-direct-multiplayer-submit",
  );
  submitButton.addEventListener("click", submit);
  displayNameInput.addEventListener("input", () => {
    displayNameInput.removeAttribute("aria-invalid");
  });
  displayNameInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });

  panel.append(title, fanNotice, displayNameField, submitButton, message);
  screen.appendChild(panel);
  mount.appendChild(screen);
  return screen;
}

export function renderRoomEntryScreen(
  mount: HTMLElement,
  options: RoomEntryScreenOptions,
): HTMLElement {
  mount.innerHTML = "";

  const copy = getPokeLoungeCopyForUrl(options.currentUrl);
  const screen = document.createElement("section");
  screen.className = "room-entry-screen";
  screen.setAttribute("data-room-entry-screen", "true");
  screen.toggleAttribute("data-local-test-mode-active", options.localTestMode?.active === true);

  const panel = document.createElement("div");
  panel.className = "room-entry-panel";
  const title = document.createElement("h1");
  title.textContent = copy.roomEntry.title;
  const fanNotice = createFanNotice(copy);
  const message = createMessage();

  const soloMode = createModeGroup(
    "solo",
    copy.roomEntry.soloTitle,
    copy.roomEntry.soloDescription,
  );
  const soloActions = document.createElement("div");
  soloActions.className = "room-entry-mode-actions";
  const soloButton = createButton(copy.roomEntry.continue, "data-room-entry-solo");
  const newStartButton = createButton(copy.roomEntry.newGame, "data-room-entry-new-start");
  newStartButton.classList.add("room-entry-new-game-button");
  soloActions.append(soloButton, newStartButton);
  soloMode.content.appendChild(soloActions);

  let localTestStartButton: HTMLButtonElement | null = null;
  let localTestExitButton: HTMLButtonElement | null = null;
  if (options.localTestMode) {
    const localTestMode = document.createElement("section");
    localTestMode.className = "room-entry-local-test";
    localTestMode.setAttribute("data-room-entry-local-test", "true");
    localTestMode.toggleAttribute("data-local-test-mode-active", options.localTestMode.active);
    const localTestTitle = document.createElement("h3");
    localTestTitle.className = "room-entry-field-label";
    localTestTitle.textContent = copy.roomEntry.localTestTitle;
    const localTestDescription = document.createElement("p");
    localTestDescription.className = "room-entry-field-copy";
    localTestDescription.textContent = copy.roomEntry.localTestDescription;
    const localTestActions = document.createElement("div");
    localTestActions.className = "room-entry-local-test-actions";
    localTestStartButton = createButton(
      options.localTestMode.active
        ? copy.roomEntry.localTestContinue
        : copy.roomEntry.localTestStart,
      "data-room-entry-local-test-start",
    );
    localTestActions.appendChild(localTestStartButton);
    if (options.localTestMode.active) {
      localTestExitButton = createButton(
        copy.roomEntry.localTestExit,
        "data-room-entry-local-test-exit",
      );
      localTestActions.appendChild(localTestExitButton);
    }
    localTestMode.append(localTestTitle, localTestDescription, localTestActions);
    soloMode.content.appendChild(localTestMode);
  }

  const multiplayerMode = createModeGroup(
    "multiplayer",
    copy.roomEntry.multiplayerTitle,
    copy.roomEntry.multiplayerDescription,
  );
  const displayNameInput = createMultiplayerDisplayNameInput(
    options.initialDisplayName,
    copy.roomEntry,
  );
  const displayNameDescription = document.createElement("p");
  displayNameDescription.className = "room-entry-field-copy";
  displayNameDescription.textContent = copy.roomEntry.multiplayerNameDescription;
  const displayNameField = createLabeledField(
    copy.roomEntry.multiplayerNameLabel,
    MULTIPLAYER_DISPLAY_NAME_INPUT_ID,
    displayNameInput,
    displayNameDescription,
  );
  const temporaryPasswordInput = createTemporaryPasswordInput(
    copy.roomEntry.temporaryPasswordPlaceholder,
  );
  const temporaryPasswordDescription = document.createElement("p");
  temporaryPasswordDescription.className = "room-entry-field-copy";
  temporaryPasswordDescription.textContent = copy.roomEntry.temporaryPasswordDescription;
  const temporaryPasswordField = createLabeledField(
    copy.roomEntry.temporaryPasswordLabel,
    TEMPORARY_PASSWORD_INPUT_ID,
    temporaryPasswordInput,
    temporaryPasswordDescription,
  );
  const multiplayerSubmitButton = createButton(
    copy.roomEntry.multiplayerConnect,
    "data-room-entry-multiplayer-submit",
  );
  multiplayerMode.content.append(displayNameField, temporaryPasswordField, multiplayerSubmitButton);

  const newGameDialog = createNewGameConfirmationDialog(copy, () => {
    message.textContent = "";
    options.onSelect({
      mode: "solo",
      roomCode: null,
      inviteUrl: null,
      resetSession: true,
    });
  });

  const selectMultiplayerRoom = async () => {
    const displayName = getMultiplayerDisplayName(
      displayNameInput,
      message,
      copy.roomEntry.multiplayerNameRequired,
    );
    if (!displayName) {
      return;
    }
    const temporaryPassword = normalizeTemporaryPassword(temporaryPasswordInput.value);
    temporaryPasswordInput.value = temporaryPassword;
    if (!temporaryPassword) {
      temporaryPasswordInput.setAttribute("aria-invalid", "true");
      message.textContent = copy.roomEntry.temporaryPasswordRequired;
      temporaryPasswordInput.focus();
      return;
    }

    multiplayerSubmitButton.disabled = true;
    message.textContent = "";
    try {
      const roomCode = await deriveTemporaryRoomCode(temporaryPassword);
      playRoomEntryConfirmSound();
      options.onSelect({
        mode: "server-room",
        roomCode,
        inviteUrl: null,
        displayName,
        createRoom: true,
      });
    } catch {
      multiplayerSubmitButton.disabled = false;
      message.textContent = copy.roomEntry.multiplayerConnectFailed;
    }
  };

  soloButton.addEventListener("click", () => {
    playRoomEntryConfirmSound();
    message.textContent = "";
    options.onSelect({ mode: "solo", roomCode: null, inviteUrl: null });
  });
  newStartButton.addEventListener("click", () => {
    playRoomEntryConfirmSound();
    openConfirmationDialog(newGameDialog.dialog, newGameDialog.cancelButton);
  });
  localTestStartButton?.addEventListener("click", () => {
    playRoomEntryConfirmSound();
    message.textContent = "";
    options.localTestMode?.onStart();
  });
  localTestExitButton?.addEventListener("click", () => {
    playRoomEntryConfirmSound();
    message.textContent = "";
    options.localTestMode?.onExit();
  });
  multiplayerSubmitButton.addEventListener("click", () => {
    void selectMultiplayerRoom();
  });
  displayNameInput.addEventListener("input", () => {
    displayNameInput.removeAttribute("aria-invalid");
  });
  temporaryPasswordInput.addEventListener("input", () => {
    temporaryPasswordInput.removeAttribute("aria-invalid");
  });
  temporaryPasswordInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      void selectMultiplayerRoom();
    }
  });

  panel.append(title, fanNotice, soloMode.element);
  if (!options.localTestMode?.active) {
    panel.append(multiplayerMode.element);
  }
  panel.append(message, newGameDialog.dialog);
  screen.appendChild(panel);
  mount.appendChild(screen);
  return screen;
}

function createFanNotice(copy: PokeLoungeCopy): HTMLParagraphElement {
  const notice = document.createElement("p");
  notice.className = "room-entry-notice";
  notice.setAttribute("data-poke-lounge-fan-notice", "true");
  notice.textContent = copy.roomEntry.fanNotice;
  return notice;
}

function createMessage(): HTMLParagraphElement {
  const message = document.createElement("p");
  message.className = "room-entry-message";
  message.setAttribute("data-room-entry-message", "true");
  message.setAttribute("role", "alert");
  message.setAttribute("aria-live", "assertive");
  message.setAttribute("aria-atomic", "true");
  return message;
}

function playRoomEntryConfirmSound(): void {
  void primePokeLoungeAudio();
  playPokeLoungeSfx("button-confirm");
}

function createButton(label: string, dataAttribute: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute(dataAttribute, "true");
  return button;
}

function createModeGroup(
  mode: "solo" | "multiplayer",
  titleText: string,
  descriptionText: string,
): { element: HTMLElement; content: HTMLElement } {
  const element = document.createElement("section");
  element.className = "room-entry-mode-group";
  element.setAttribute("data-room-entry-mode", mode);
  const title = document.createElement("h2");
  title.className = "room-entry-mode-heading";
  title.textContent = titleText;
  const description = document.createElement("p");
  description.className = "room-entry-mode-copy";
  description.textContent = descriptionText;
  const content = document.createElement("div");
  content.className = "room-entry-mode-content";
  element.append(title, description, content);
  return { element, content };
}

function createMultiplayerDisplayNameInput(
  initialDisplayName: string | undefined,
  copy: PokeLoungeCopy["roomEntry"],
): HTMLInputElement {
  const input = document.createElement("input");
  input.id = MULTIPLAYER_DISPLAY_NAME_INPUT_ID;
  input.type = "text";
  input.autocomplete = "off";
  input.maxLength = MAX_MULTIPLAYER_DISPLAY_NAME_LENGTH;
  input.placeholder = copy.multiplayerNamePlaceholder;
  input.value = resolveInitialMultiplayerDisplayName(
    initialDisplayName,
    copy.multiplayerNameModifiers,
    copy.multiplayerNameNouns,
  );
  input.setAttribute("data-room-entry-display-name", "true");
  return input;
}

function createTemporaryPasswordInput(placeholder: string): HTMLInputElement {
  const input = document.createElement("input");
  input.id = TEMPORARY_PASSWORD_INPUT_ID;
  input.type = "password";
  input.inputMode = "text";
  input.autocomplete = "off";
  input.maxLength = 64;
  input.placeholder = placeholder;
  input.setAttribute("data-room-entry-temporary-password", "true");
  return input;
}

function getMultiplayerDisplayName(
  input: HTMLInputElement,
  message: HTMLElement,
  requiredMessage: string,
): string | null {
  const displayName = normalizeMultiplayerDisplayName(input.value);
  input.value = displayName;
  if (!displayName) {
    input.setAttribute("aria-invalid", "true");
    message.textContent = requiredMessage;
    input.focus();
    return null;
  }
  input.removeAttribute("aria-invalid");
  return displayName;
}

export function normalizeMultiplayerDisplayName(value: string): string {
  return Array.from(value.trim()).slice(0, MAX_MULTIPLAYER_DISPLAY_NAME_LENGTH).join("");
}

export function createRandomMultiplayerDisplayName(
  modifiers: PokeLoungeCopy["roomEntry"]["multiplayerNameModifiers"],
  nouns: PokeLoungeCopy["roomEntry"]["multiplayerNameNouns"],
  random: () => number = Math.random,
): string {
  const combinationCount = modifiers.length * nouns.length;
  const index = Math.floor(Math.max(0, Math.min(0.999999, random())) * combinationCount);

  return `${modifiers[Math.floor(index / nouns.length)]} ${nouns[index % nouns.length]}`;
}

export function resolveInitialMultiplayerDisplayName(
  initialDisplayName: string | undefined,
  modifiers: PokeLoungeCopy["roomEntry"]["multiplayerNameModifiers"],
  nouns: PokeLoungeCopy["roomEntry"]["multiplayerNameNouns"],
  random: () => number = Math.random,
): string {
  const normalizedName = normalizeMultiplayerDisplayName(initialDisplayName ?? "");

  return normalizedName && !/^player \d+$/i.test(normalizedName)
    ? normalizedName
    : createRandomMultiplayerDisplayName(modifiers, nouns, random);
}

function createLabeledField(
  labelText: string,
  inputId: string,
  control: HTMLElement,
  description?: HTMLElement,
): HTMLElement {
  const field = document.createElement("div");
  field.className = "room-entry-field";
  const label = document.createElement("label");
  label.className = "room-entry-field-label";
  label.htmlFor = inputId;
  label.textContent = labelText;
  field.append(label, control);
  if (description) {
    field.appendChild(description);
  }
  return field;
}

function createNewGameConfirmationDialog(
  copy: PokeLoungeCopy,
  onConfirm: () => void,
): { dialog: HTMLDialogElement; cancelButton: HTMLButtonElement } {
  const dialog = document.createElement("dialog");
  dialog.className = "room-entry-confirm-dialog";
  dialog.setAttribute("data-room-entry-new-start-dialog", "true");
  dialog.setAttribute("role", "alertdialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", NEW_GAME_DIALOG_TITLE_ID);
  dialog.setAttribute("aria-describedby", NEW_GAME_DIALOG_DESCRIPTION_ID);
  const content = document.createElement("div");
  content.className = "room-entry-confirm-dialog-content";
  const title = document.createElement("h2");
  title.id = NEW_GAME_DIALOG_TITLE_ID;
  title.textContent = copy.roomEntry.newGameTitle;
  const description = document.createElement("p");
  description.id = NEW_GAME_DIALOG_DESCRIPTION_ID;
  description.className = "room-entry-confirm-dialog-copy";
  description.textContent = copy.roomEntry.newGameDescription;
  const actions = document.createElement("div");
  actions.className = "room-entry-confirm-dialog-actions";
  const cancelButton = createButton(copy.roomEntry.cancel, "data-room-entry-new-start-cancel");
  const confirmButton = createButton(
    copy.roomEntry.resetAndStart,
    "data-room-entry-new-start-confirm",
  );
  confirmButton.classList.add("room-entry-confirm-dialog-danger");
  cancelButton.addEventListener("click", () => closeConfirmationDialog(dialog));
  confirmButton.addEventListener("click", () => {
    closeConfirmationDialog(dialog);
    playRoomEntryConfirmSound();
    onConfirm();
  });
  actions.append(cancelButton, confirmButton);
  content.append(title, description, actions);
  dialog.appendChild(content);
  return { dialog, cancelButton };
}

function openConfirmationDialog(dialog: HTMLDialogElement, initialFocus: HTMLButtonElement): void {
  if (dialog.open) {
    return;
  }
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "true");
  }
  initialFocus.focus();
}

function closeConfirmationDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}
