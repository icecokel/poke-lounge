export const POKE_LOUNGE_ROOM_LEAVE_REQUEST_EVENT = "poke-lounge:room-leave-request";
export const POKE_LOUNGE_NOTICE_EVENT = "poke-lounge:notice";
export const POKE_LOUNGE_ACCESSIBLE_STATUS_EVENT = "poke-lounge:accessible-status";

export interface PokeLoungeRoomLeaveRequestDetail {
  confirm(): void;
  description: string;
  title: string;
}

export interface PokeLoungeNoticeDetail {
  message: string;
  tone: "info" | "warning" | "error";
}

export interface PokeLoungeAccessibleStatusDetail {
  message: string;
}

export function dispatchPokeLoungeNotice(
  documentRef: Document,
  detail: PokeLoungeNoticeDetail,
): void {
  documentRef.dispatchEvent(
    new CustomEvent<PokeLoungeNoticeDetail>(POKE_LOUNGE_NOTICE_EVENT, { detail }),
  );
}

export function dispatchPokeLoungeAccessibleStatus(documentRef: Document, message: string): void {
  documentRef.dispatchEvent(
    new CustomEvent<PokeLoungeAccessibleStatusDetail>(POKE_LOUNGE_ACCESSIBLE_STATUS_EVENT, {
      detail: { message },
    }),
  );
}
