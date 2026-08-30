/**
 * 애플리케이션 전반에서 사용되는 에러 메시지 상수 정의
 */
export const ErrorMessage = {
  // 인증 관련 에러 메시지
  AUTH: {
    NO_TOKEN: '토큰이 제공되지 않았습니다.',
    INVALID_TOKEN: '유효하지 않은 토큰입니다.',
    EMAIL_REQUIRED: '이메일 정보가 필수입니다.',
    LOGIN_FAILED: '로그인 처리에 실패했습니다.',
  },
  // 게임 관련 에러 메시지
  GAME: {
    INVALID_GAME_TYPE: '유효하지 않은 게임 타입입니다.',
  },
  // 공통 에러 메시지
  COMMON: {
    INTERNAL_SERVER_ERROR: '서버 내부 오류가 발생했습니다.',
  },
} as const;
