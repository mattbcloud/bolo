/**
 * Functions that provide functionality somewhat like Python's `struct` module: packing and
 * unpacking a bunch of values to and from binary data.
 *
 * The main differences with Python are that this version is far less featureful, of course, but
 * also that this version is built for streaming, using a generator pattern. This allows the caller
 * to make decisions mid-stream about the data that's going to follow.
 *
 * Because there's no standard way for dealing with binary data in JavaScript (yet), these functions
 * deal with arrays of byte values instead.
 */

// Type definitions
type FormatChar = 'B' | 'H' | 'I' | 'f';

export interface Packer {
  (type: FormatChar, value: number | boolean): void;
  finish(): number[];
}

export interface Unpacker {
  (type: FormatChar): number | boolean;
  finish(): number;
}

// Helpers

/**
 * The following methods pack numbers in an array of bytes, in network byte order.
 */

function toUint8(n: number): number[] {
  return [n & 0xff];
}

function toUint16(n: number): number[] {
  return [(n & 0xff00) >> 8, n & 0x00ff];
}

function toUint32(n: number): number[] {
  return [
    (n & 0xff000000) >>> 24,
    (n & 0x00ff0000) >> 16,
    (n & 0x0000ff00) >> 8,
    n & 0x000000ff,
  ];
}

/**
 * And the reverse of the above. Each takes an array of bytes, and an offset.
 */

function fromUint8(d: number[], o: number): number {
  return d[o];
}

function fromUint16(d: number[], o: number): number {
  return (d[o] << 8) + d[o + 1];
}

function fromUint32(d: number[], o: number): number {
  return (d[o] << 24) + (d[o + 1] << 16) + (d[o + 2] << 8) + d[o + 3];
}

// Streaming packers

/**
 * Return a generator function, that is used to generate binary data. Basic usage is as follows:
 *
 *     packer = buildPacker()
 *     packer('B', myByteValue)
 *     packer('H', myShortValue)
 *     packer('f', myBooleanValue)
 *     packer('f', mySecondBooleanValue)
 *     data = packer.finish()
 *
 * The format characters match those of Python's `struct`. However, only a subset is supported,
 * namely `B`, `H`, and `I`. In addition to these, there's also a way to tightly pack bit fields,
 * simply by using the `f` format character in repetition. The caller should take care to group
 * bit fields, though.
 */
export function buildPacker(): Packer {
  let data: number[] = [];
  let bits: number | null = null;
  let bitIndex = 0;

  const flushBitFields = () => {
    if (bits === null) return;
    data.push(bits);
    bits = null;
  };

  const retval = ((type: FormatChar, value: number | boolean) => {
    if (type === 'f') {
      if (bits === null) {
        bits = !!value ? 1 : 0;
        bitIndex = 1;
      } else {
        if (!!value) bits |= 1 << bitIndex;
        bitIndex++;
        if (bitIndex === 8) flushBitFields();
      }
    } else {
      flushBitFields();
      const numValue = value as number;
      let packed: number[];
      switch (type) {
        case 'B':
          packed = toUint8(numValue);
          break;
        case 'H':
          packed = toUint16(numValue);
          break;
        case 'I':
          packed = toUint32(numValue);
          break;
        default:
          throw new Error(`Unknown format character ${type}`);
      }
      data = data.concat(packed);
    }
  }) as Packer;

  retval.finish = () => {
    flushBitFields();
    return data;
  };

  return retval;
}

/**
 * The opposite of the above. Takes an array of bytes and an optional offset, and returns a
 * generator which can be repeatedly called to get values from the input data. For example:
 *
 *     unpacker = buildUnpacker()
 *     myByteValue = unpacker('B')
 *     myShortValue = unpacker('H')
 *     myBooleanValue = unpacker('f')
 *     mySecondBooleanValue = unpacker('f')
 *     bytesTaken = unpacker.finish()
 */
export function buildUnpacker(data: number[], offset: number = 0): Unpacker {
  let idx = offset;
  let bitIndex = 0;

  const retval = ((type: FormatChar): number | boolean => {
    let value: number | boolean;
    if (type === 'f') {
      const bit = (1 << bitIndex) & data[idx];
      value = bit > 0;
      bitIndex++;
      if (bitIndex === 8) {
        idx++;
        bitIndex = 0;
      }
    } else {
      if (bitIndex !== 0) {
        idx++;
        bitIndex = 0;
      }
      let bytes: number;
      switch (type) {
        case 'B':
          value = fromUint8(data, idx);
          bytes = 1;
          break;
        case 'H':
          value = fromUint16(data, idx);
          bytes = 2;
          break;
        case 'I':
          value = fromUint32(data, idx);
          bytes = 4;
          break;
        default:
          throw new Error(`Unknown format character ${type}`);
      }
      idx += bytes;
    }
    return value;
  }) as Unpacker;

  retval.finish = () => {
    if (bitIndex !== 0) idx++;
    return idx - offset;
  };

  return retval;
}

// Non-streaming packers
//
// These work more like Python's `struct`.

/**
 * The `pack` function takes a format string, and the respective values as its arguments. It then
 * returns the binary data as an array of byte values.
 */
export function pack(fmt: string, ...values: (number | boolean)[]): number[] {
  const packer = buildPacker();
  for (let i = 0; i < fmt.length; i++) {
    const type = fmt[i] as FormatChar;
    const value = values[i];
    packer(type, value);
  }
  return packer.finish();
}

/**
 * The `unpack` function takes a format string, an array of bytes and an optional offset. The return
 * value is a pair containing an array of the unpacked values, and the number of bytes taken.
 */
export function unpack(
  fmt: string,
  data: number[],
  offset?: number
): [(number | boolean)[], number] {
  const unpacker = buildUnpacker(data, offset);
  const values: (number | boolean)[] = [];
  for (const char of fmt) {
    values.push(unpacker(char as FormatChar));
  }
  return [values, unpacker.finish()];
}
