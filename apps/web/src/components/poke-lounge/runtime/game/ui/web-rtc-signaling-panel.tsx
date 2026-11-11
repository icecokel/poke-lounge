"use client";

import { useState } from "react";
import type { PokeLoungeRuntimeState } from "../game-page-state";
import { getWebRtcSignalingCopy } from "../network/web-rtc-signaling-panel";

export function WebRtcSignalingPanel({
  room,
  onLeave,
}: {
  room: NonNullable<
    Extract<PokeLoungeRuntimeState, { phase: "world" | "battle" | "lobby" }>["webRtc"]
  >["room"];
  onLeave(): void;
}) {
  const copy = getWebRtcSignalingCopy(
    typeof document === "undefined" ? null : document.documentElement.lang,
  );
  const [status, setStatus] = useState(copy.waiting);
  const [localSignal, setLocalSignal] = useState("");
  const [remoteSignal, setRemoteSignal] = useState("");
  const [processing, setProcessing] = useState(false);
  const run = async (action: () => Promise<string | void>, success: string) => {
    setProcessing(true);
    setStatus(copy.processing);
    try {
      const signal = await action();
      if (typeof signal === "string") {
        setLocalSignal(signal);
      }
      setStatus(success);
    } catch {
      setStatus(copy.failed);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <section
      className="absolute right-[max(12px,env(safe-area-inset-right))] bottom-[max(12px,env(safe-area-inset-bottom))] z-45 grid max-h-[min(260px,calc(100dvh-24px))] w-[min(320px,calc(100%-24px))] gap-1.5 overflow-auto rounded-md border-[3px] border-[#17231c] bg-[rgb(248_251_240_/_94%)] p-2.5 text-xs font-black text-[#17201a] shadow-[0_5px_0_rgb(23_35_28_/_86%)]"
      data-webrtc-signaling-panel="true"
    >
      <strong>WebRTC {room.sessionId}</strong>
      <span className="text-[#607d6c]" role="status" aria-live="polite" data-webrtc-status="true">
        {status}
      </span>
      <textarea
        className="min-h-[46px] w-full resize-y rounded border-2 border-[#314236] bg-[#fffef3] p-1 font-[inherit] text-[#17201a]"
        value={localSignal}
        readOnly
        placeholder={copy.localSignal}
        data-webrtc-local-signal="true"
      />
      <textarea
        className="min-h-[46px] w-full resize-y rounded border-2 border-[#314236] bg-[#fffef3] p-1 font-[inherit] text-[#17201a]"
        value={remoteSignal}
        disabled={processing}
        placeholder={copy.remoteSignal}
        onChange={function handleChange(event) {
          return setRemoteSignal(event.currentTarget.value);
        }}
        data-webrtc-remote-signal="true"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className="min-h-[30px] min-w-0 cursor-pointer rounded border-2 border-[#17231c] bg-[#e9e9e4] p-1 text-[0.7rem] font-black text-[#17201a] shadow-[0_3px_0_#17231c] active:translate-y-0.5 active:bg-[#fff9dd] active:shadow-[0_1px_0_#17231c] disabled:cursor-default disabled:opacity-55"
          disabled={processing}
          onClick={function handleClick() {
            return void run(function callback() {
              return room.createOfferSignal();
            }, copy.offerCreated);
          }}
          data-webrtc-create-offer="true"
        >
          {copy.createOffer}
        </button>
        <button
          type="button"
          className="min-h-[30px] min-w-0 cursor-pointer rounded border-2 border-[#17231c] bg-[#e9e9e4] p-1 text-[0.7rem] font-black text-[#17201a] shadow-[0_3px_0_#17231c] active:translate-y-0.5 active:bg-[#fff9dd] active:shadow-[0_1px_0_#17231c] disabled:cursor-default disabled:opacity-55"
          disabled={processing}
          onClick={function handleClick() {
            return void run(function callback() {
              return room.acceptOfferSignal(remoteSignal.trim());
            }, copy.answerCreated);
          }}
          data-webrtc-accept-offer="true"
        >
          {copy.acceptOffer}
        </button>
        <button
          type="button"
          className="min-h-[30px] min-w-0 cursor-pointer rounded border-2 border-[#17231c] bg-[#e9e9e4] p-1 text-[0.7rem] font-black text-[#17201a] shadow-[0_3px_0_#17231c] active:translate-y-0.5 active:bg-[#fff9dd] active:shadow-[0_1px_0_#17231c] disabled:cursor-default disabled:opacity-55"
          disabled={processing}
          onClick={function handleClick() {
            return void run(function callback() {
              return room.acceptAnswerSignal(remoteSignal.trim());
            }, copy.answerApplied);
          }}
          data-webrtc-accept-answer="true"
        >
          {copy.acceptAnswer}
        </button>
        <button
          type="button"
          className="min-h-[30px] min-w-0 cursor-pointer rounded border-2 border-[#17231c] bg-[#ffd7d1] p-1 text-[0.7rem] font-black text-[#17201a] shadow-[0_3px_0_#17231c] active:translate-y-0.5 active:shadow-[0_1px_0_#17231c] disabled:cursor-default disabled:opacity-55"
          disabled={processing}
          onClick={function handleClick() {
            room.dispose();
            setStatus(copy.ended);
            onLeave();
          }}
          data-webrtc-leave="true"
        >
          {copy.leave}
        </button>
      </div>
    </section>
  );
}
