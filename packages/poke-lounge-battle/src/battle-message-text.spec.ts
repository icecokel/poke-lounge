import { withSubjectParticle } from "./battle-message-text";

it.each([
  "파이리",
  "메타몽",
  "리자몽",
  "공격",
  "방어",
  "특수방어",
  "스피드",
  "명중률",
  "Trainer 1",
  14,
])("uses 이(가) without changing the subject: %s", value =>
  expect(withSubjectParticle(value)).toBe(`${value}이(가)`),
);
