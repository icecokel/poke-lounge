import { createWinstonConfig } from './winston.config';

type WinstonTransport = {
  level?: string;
  options?: {
    filename?: string;
    maxFiles?: string;
  };
  constructor: {
    name: string;
  };
};

const ORIGINAL_ENV = process.env;

describe('winstonConfig', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NOTIFY_SERVICE_URL;
    delete process.env.NOTIFY_SERVICE_USER;
    delete process.env.NOTIFY_SERVICE_PASSWORD;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('운영 환경에서도 알림 env가 없으면 NotifyTransport를 등록하지 않아야 함', () => {
    process.env.NODE_ENV = 'production';

    const winstonConfig = createWinstonConfig() as {
      level: string;
      transports: WinstonTransport[];
    };

    expect(
      winstonConfig.transports.some(
        (transport) => transport.constructor.name === 'NotifyTransport',
      ),
    ).toBe(false);
  });

  it('운영 알림 env가 있어도 Winston transport에서 중복 알림을 보내지 않아야 함', () => {
    process.env.NODE_ENV = 'production';
    process.env.NOTIFY_SERVICE_URL = 'https://notify.example.test/send';
    process.env.NOTIFY_SERVICE_USER = 'notify-user';
    process.env.NOTIFY_SERVICE_PASSWORD = 'notify-password';

    const winstonConfig = createWinstonConfig() as {
      transports: WinstonTransport[];
    };

    expect(
      winstonConfig.transports.some(
        (transport) => transport.constructor.name === 'NotifyTransport',
      ),
    ).toBe(false);
  });

  it('LOG_LEVEL이 있으면 콘솔 로그 최소 레벨로 사용해야 한다', () => {
    process.env.LOG_LEVEL = 'warn';

    const winstonConfig = createWinstonConfig() as {
      transports: WinstonTransport[];
    };
    const consoleTransport = winstonConfig.transports.find(
      (transport) => transport.constructor.name === 'Console',
    );

    expect(consoleTransport?.level).toBe('warn');
    expect(winstonConfig.level).toBe('warn');
  });

  it('일별 파일 로그는 180일 동안 보관해야 한다', () => {
    const winstonConfig = createWinstonConfig() as {
      transports: WinstonTransport[];
    };
    const fileTransports = winstonConfig.transports.filter(
      (transport) => transport.constructor.name === 'DailyRotateFile',
    );

    expect(fileTransports).toHaveLength(2);
    expect(
      fileTransports.map((transport) => transport.options?.maxFiles),
    ).toEqual(['180d', '180d']);
  });
});
