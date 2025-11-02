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
type FormatChar = 'B' | 'H' | 'I' | 'f';
export interface Packer {
    (type: FormatChar, value: number | boolean): void;
    finish(): number[];
}
export interface Unpacker {
    (type: FormatChar): number | boolean;
    finish(): number;
}
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
export declare function buildPacker(): Packer;
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
export declare function buildUnpacker(data: number[], offset?: number): Unpacker;
/**
 * The `pack` function takes a format string, and the respective values as its arguments. It then
 * returns the binary data as an array of byte values.
 */
export declare function pack(fmt: string, ...values: (number | boolean)[]): number[];
/**
 * The `unpack` function takes a format string, an array of bytes and an optional offset. The return
 * value is a pair containing an array of the unpacked values, and the number of bytes taken.
 */
export declare function unpack(fmt: string, data: number[], offset?: number): [(number | boolean)[], number];
export {};
//# sourceMappingURL=struct.d.ts.map