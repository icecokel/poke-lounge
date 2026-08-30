import type { WebRtcRoom } from "./webRtcRoom";
import { resolvePokeLoungeLocale, type PokeLoungeLocale } from "../../../poke-lounge-copy";

export interface WebRtcSignalingPanelOptions {
  onLeave?: () => void;
}

interface WebRtcSignalingCopy {
  waiting: string;
  localSignal: string;
  remoteSignal: string;
  createOffer: string;
  acceptOffer: string;
  acceptAnswer: string;
  leave: string;
  processing: string;
  offerCreated: string;
  answerCreated: string;
  answerApplied: string;
  ended: string;
  failed: string;
}

const WEBRTC_SIGNALING_COPY: Record<PokeLoungeLocale, WebRtcSignalingCopy> = {
  "ko-KR": {
    waiting: "수동 연결 대기",
    localSignal: "내 signal",
    remoteSignal: "상대 signal 붙여넣기",
    createOffer: "Offer 생성",
    acceptOffer: "Offer 적용",
    acceptAnswer: "Answer 적용",
    leave: "나가기",
    processing: "처리 중",
    offerCreated: "Offer 생성 완료",
    answerCreated: "Answer 생성 완료",
    answerApplied: "Answer 적용 완료",
    ended: "연결 종료",
    failed: "WebRTC 처리 실패",
  },
  "en-US": {
    waiting: "Waiting for manual connection",
    localSignal: "My signal",
    remoteSignal: "Paste peer signal",
    createOffer: "Create offer",
    acceptOffer: "Accept offer",
    acceptAnswer: "Apply answer",
    leave: "Leave",
    processing: "Processing",
    offerCreated: "Offer created",
    answerCreated: "Answer created",
    answerApplied: "Answer applied",
    ended: "Connection ended",
    failed: "WebRTC action failed",
  },
  "ja-JP": {
    waiting: "手動接続を待機中",
    localSignal: "自分のsignal",
    remoteSignal: "相手のsignalを貼り付け",
    createOffer: "Offerを作成",
    acceptOffer: "Offerを適用",
    acceptAnswer: "Answerを適用",
    leave: "退出",
    processing: "処理中",
    offerCreated: "Offerを作成しました",
    answerCreated: "Answerを作成しました",
    answerApplied: "Answerを適用しました",
    ended: "接続を終了しました",
    failed: "WebRTCの処理に失敗しました",
  },
};

export function getWebRtcSignalingCopy(locale?: string | null): WebRtcSignalingCopy {
  return WEBRTC_SIGNALING_COPY[resolvePokeLoungeLocale(locale)];
}

export function renderWebRtcSignalingPanel(
  mount: HTMLElement,
  room: WebRtcRoom,
  options: WebRtcSignalingPanelOptions = {},
): HTMLElement {
  mount.querySelector("[data-webrtc-signaling-panel]")?.remove();
  const documentRef = mount.ownerDocument;
  const copy = getWebRtcSignalingCopy(documentRef.documentElement.lang);

  const panel = documentRef.createElement("section");
  panel.className = "webrtc-signaling-panel";
  panel.setAttribute("data-webrtc-signaling-panel", "true");

  const title = documentRef.createElement("strong");
  title.textContent = `WebRTC ${room.sessionId}`;

  const status = documentRef.createElement("span");
  status.className = "webrtc-signaling-panel__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.setAttribute("data-webrtc-status", "true");
  status.textContent = copy.waiting;

  const localSignal = documentRef.createElement("textarea");
  localSignal.className = "webrtc-signaling-panel__textarea";
  localSignal.readOnly = true;
  localSignal.placeholder = copy.localSignal;
  localSignal.setAttribute("data-webrtc-local-signal", "true");

  const remoteSignal = documentRef.createElement("textarea");
  remoteSignal.className = "webrtc-signaling-panel__textarea";
  remoteSignal.placeholder = copy.remoteSignal;
  remoteSignal.setAttribute("data-webrtc-remote-signal", "true");

  const actions = documentRef.createElement("div");
  actions.className = "webrtc-signaling-panel__actions";

  const createOfferButton = createButton(documentRef, copy.createOffer, "data-webrtc-create-offer");
  const acceptOfferButton = createButton(documentRef, copy.acceptOffer, "data-webrtc-accept-offer");
  const acceptAnswerButton = createButton(
    documentRef,
    copy.acceptAnswer,
    "data-webrtc-accept-answer",
  );
  const leaveButton = createButton(documentRef, copy.leave, "data-webrtc-leave");
  leaveButton.classList.add("webrtc-signaling-panel__button--danger");
  const actionButtons = [createOfferButton, acceptOfferButton, acceptAnswerButton, leaveButton];

  createOfferButton.addEventListener("click", () => {
    runSignalingAction(status, copy, async () => {
      localSignal.value = await room.createOfferSignal();
      status.textContent = copy.offerCreated;
    });
  });
  acceptOfferButton.addEventListener("click", () => {
    runSignalingAction(status, copy, async () => {
      localSignal.value = await room.acceptOfferSignal(remoteSignal.value.trim());
      status.textContent = copy.answerCreated;
    });
  });
  acceptAnswerButton.addEventListener("click", () => {
    runSignalingAction(status, copy, async () => {
      await room.acceptAnswerSignal(remoteSignal.value.trim());
      status.textContent = copy.answerApplied;
    });
  });
  leaveButton.addEventListener("click", () => {
    room.dispose();
    options.onLeave?.();
    status.textContent = copy.ended;
    localSignal.disabled = true;
    remoteSignal.disabled = true;
    actionButtons.forEach(button => {
      button.disabled = true;
    });
  });

  actions.append(createOfferButton, acceptOfferButton, acceptAnswerButton, leaveButton);
  panel.append(title, status, localSignal, remoteSignal, actions);
  mount.appendChild(panel);

  return panel;
}

function createButton(
  documentRef: Document,
  label: string,
  dataAttribute: string,
): HTMLButtonElement {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = "webrtc-signaling-panel__button";
  button.textContent = label;
  button.setAttribute(dataAttribute, "true");

  return button;
}

function runSignalingAction(
  status: HTMLElement,
  copy: WebRtcSignalingCopy,
  action: () => Promise<void>,
): void {
  status.textContent = copy.processing;
  void action().catch(() => {
    status.textContent = copy.failed;
  });
}
