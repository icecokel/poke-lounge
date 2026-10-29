import type { LeagueFraction } from "./contract";

const ZERO = BigInt(0);
const TWO = BigInt(2);

export class Fraction {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint | number, den: bigint | number = 1) {
    let n = BigInt(num),
      d = BigInt(den);
    if (d === ZERO) throw new RangeError("Zero denominator");
    if (d < ZERO) {
      n = -n;
      d = -d;
    }
    let a = n < ZERO ? -n : n,
      b = d;
    while (b !== ZERO) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    this.num = n / a;
    this.den = d / a;
  }

  add(other: Fraction): Fraction {
    return new Fraction(this.num * other.den + other.num * this.den, this.den * other.den);
  }
  mul(other: Fraction): Fraction {
    return new Fraction(this.num * other.num, this.den * other.den);
  }
  div(other: Fraction): Fraction {
    return new Fraction(this.num * other.den, this.den * other.num);
  }
  compare(other: Fraction): number {
    const difference = this.num * other.den - other.num * this.den;
    return difference < ZERO ? -1 : difference > ZERO ? 1 : 0;
  }
  roundHalfUp(): bigint {
    if (this.num < ZERO) throw new RangeError("roundHalfUp requires a nonnegative value");
    return (TWO * this.num + this.den) / (TWO * this.den);
  }
  toJSON(): LeagueFraction {
    return { num: String(this.num), den: String(this.den) };
  }
  static fromJSON(value: LeagueFraction): Fraction {
    if (!/^-?(0|[1-9]\d*)$/.test(value.num) || !/^[1-9]\d*$/.test(value.den))
      throw new TypeError("Invalid fraction");
    const result = new Fraction(BigInt(value.num), BigInt(value.den));
    if (result.num.toString() !== value.num || result.den.toString() !== value.den)
      throw new TypeError("Fraction must be reduced");
    return result;
  }
}
