import { useEffect, useId, useState } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import { PixelButton, PixelPanel } from "../../../ui/poke-lounge-ui-primitives";
import type { PokeLoungeRuntimeState } from "../game-page-state";
import { checkServerRoomResume, clearStoredServerRoomResume } from "../network/server-room";

type RoomResume = NonNullable<Extract<PokeLoungeRuntimeState, { screen: "room" }>["roomResume"]>;

export function RoomResumePanel({
  copy,
  roomResume,
}: {
  copy: PokeLoungeCopy;
  roomResume: RoomResume;
}) {
  const [status, setStatus] = useState<"checking" | "available" | "unavailable" | "failed">(
    "checking",
  );
  const [request, setRequest] = useState(0);
  const [continuing, setContinuing] = useState(false);
  const descriptionId = useId();
  const text = copy.roomEntry;

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    let active = true;
    setStatus("checking");
    void checkServerRoomResume(roomResume.resume, roomResume.accountId, controller.signal)
      .then(available => {
        if (!active) return;
        if (!available) clearStoredServerRoomResume(roomResume.accountId, roomResume.resume.runId);
        setStatus(available ? "available" : "unavailable");
        if (available && continuing) roomResume.onResume();
      })
      .catch(() => {
        if (active) setStatus("failed");
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [roomResume, request, continuing]);

  return (
    <PixelPanel className="grid gap-3 p-4" data-room-resume-panel>
      <h2 className="m-0 text-lg font-black">{text.resumeTitle}</h2>
      <p className="m-0 text-sm leading-relaxed" id={descriptionId} role="status">
        {status === "checking"
          ? text.resumeChecking
          : status === "unavailable"
            ? text.resumeUnavailable
            : status === "failed"
              ? text.resumeCheckFailed
              : text.resumeDescription}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {status === "available" ? (
          <PixelButton
            className="min-h-11 px-3 py-2 whitespace-normal"
            aria-describedby={descriptionId}
            onClick={() => {
              setContinuing(true);
              setRequest(value => value + 1);
            }}
          >
            {text.resumeAction}
          </PixelButton>
        ) : status === "failed" ? (
          <PixelButton
            className="min-h-11 px-3 py-2"
            onClick={() => setRequest(value => value + 1)}
          >
            {copy.startup.retry}
          </PixelButton>
        ) : null}
        <PixelButton className="min-h-11 px-3 py-2" onClick={roomResume.onDiscard}>
          {text.resumeDiscard}
        </PixelButton>
      </div>
    </PixelPanel>
  );
}
