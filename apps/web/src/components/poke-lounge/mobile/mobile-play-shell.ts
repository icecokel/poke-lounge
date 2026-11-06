// Shared phone-shaped play surface for multiplayer and league growth.
export const MOBILE_SHELL_BASE =
  "fixed grid min-h-0 w-[var(--poke-lounge-mobile-app-width)] overflow-clip overscroll-none bg-[#17201a] text-[var(--pl-color-ink)] [--poke-lounge-container-width:100vw] [--poke-lounge-container-height:100dvh] [--poke-lounge-frame-available-height:100%] [--poke-lounge-max-display-width:1440px] [--poke-lounge-mobile-app-width:min(var(--poke-lounge-container-width),480px)] [--poke-lounge-mobile-letterbox-bottom:max(16px,env(safe-area-inset-bottom,0px))] [--poke-lounge-mobile-letterbox-top:max(16px,env(safe-area-inset-top,0px))] [--rom-screen-background:var(--pl-color-ink)] [container-name:poke-viewport] [container-type:size] [font-family:var(--pl-font-game)]";

export const MOBILE_SHELL_POSITION =
  "top-[var(--poke-lounge-viewport-top,0px)] left-[calc(var(--poke-lounge-viewport-left,0px)+max(0px,(var(--poke-lounge-container-width)-var(--poke-lounge-mobile-app-width))/2))] h-[var(--poke-lounge-container-height)]";

export const MOBILE_SHELL_CONTENT =
  "grid-cols-[minmax(0,min(100%,480px))] grid-rows-[minmax(0,1fr)] content-stretch items-stretch justify-center gap-0 pt-[var(--poke-lounge-mobile-letterbox-top)] pr-[env(safe-area-inset-right,0px)] pb-[var(--poke-lounge-mobile-letterbox-bottom)] pl-[env(safe-area-inset-left,0px)]";

export const MOBILE_SHELL_DESKTOP =
  "min-[769px]:[--poke-lounge-mobile-app-height:min(var(--poke-lounge-container-height),calc(var(--poke-lounge-mobile-app-width)*16/9))] min-[769px]:top-[calc(var(--poke-lounge-viewport-top,0px)+max(0px,(var(--poke-lounge-container-height)-var(--poke-lounge-mobile-app-height))/2))] min-[769px]:h-[var(--poke-lounge-mobile-app-height)]";

export const MOBILE_PLAY_GRID =
  "grid-cols-[minmax(0,var(--poke-lounge-layout-width,100%))] grid-rows-[auto_minmax(0,1fr)_var(--poke-lounge-layout-controller-height,256px)] gap-[var(--poke-lounge-layout-gap,8px)] data-[poke-lounge-responsive-layout=split]:grid-cols-[var(--poke-lounge-layout-frame-width)_var(--poke-lounge-layout-controller-width)] data-[poke-lounge-responsive-layout=split]:grid-rows-[auto_minmax(0,1fr)] [@media(min-width:600px)_and_(max-height:540px)]:[--poke-lounge-mobile-app-width:var(--poke-lounge-container-width)]";

export const MOBILE_PLAY_CHILDREN =
  "[&>[data-poke-lounge-play-status]]:col-[1/-1] [&>[data-poke-lounge-play-status]]:row-start-1 [&>[data-poke-lounge-play-status]]:w-full [&>[data-poke-lounge-mobile-control-dock]]:col-start-1 [&>[data-poke-lounge-mobile-control-dock]]:row-start-3 [&>[data-poke-lounge-mobile-control-dock]]:h-full [&>[data-poke-lounge-mobile-control-dock]]:w-full [&>[data-poke-lounge-mobile-control-dock]]:min-h-0 [&>[data-poke-lounge-mobile-control-dock]]:min-w-0 data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:col-start-2 data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:row-start-2 data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:border-l-2 data-[poke-lounge-responsive-layout=split]:[&>[data-poke-lounge-mobile-control-dock]]:border-t-0";
