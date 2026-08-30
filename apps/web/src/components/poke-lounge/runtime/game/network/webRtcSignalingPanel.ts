import { resolvePokeLoungeLocale, type PokeLoungeLocale } from "../../../poke-lounge-copy";

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
