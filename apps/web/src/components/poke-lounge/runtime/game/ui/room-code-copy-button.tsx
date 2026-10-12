"use client";

import { useState } from "react";
import { PixelButton } from "../../../ui/poke-lounge-ui-primitives";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import { TEMPORARY_PASSWORD_LENGTH } from "../network/room-entry";

export function RoomCodeCopyButton({
  code,
  copy,
  disabled = false,
  className,
}: {
  code: string;
  copy: PokeLoungeCopy["roomEntry"];
  disabled?: boolean;
  className?: string;
}) {
  const [copying, setCopying] = useState(false);
  const [result, setResult] = useState<{ code: string; status: "success" | "error" } | null>(null);
  const status = result?.code === code ? result.status : "idle";
  const label =
    status === "success"
      ? copy.temporaryPasswordCopied
      : status === "error"
        ? copy.temporaryPasswordCopyFailed
        : copy.temporaryPasswordCopy;

  const handleCopy = async () => {
    setCopying(true);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      setResult({ code, status: "success" });
    } catch {
      setResult({ code, status: "error" });
    } finally {
      setCopying(false);
    }
  };

  return (
    <PixelButton
      className={className}
      disabled={disabled || copying || code.length !== TEMPORARY_PASSWORD_LENGTH}
      onClick={handleCopy}
      aria-label={`${copy.temporaryPasswordLabel}: ${label}`}
      aria-busy={copying}
      data-room-code-copy
    >
      <span role="status" aria-live="polite">
        {label}
      </span>
    </PixelButton>
  );
}
