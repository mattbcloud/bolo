/**
 * Binary Packing/Unpacking Utilities
 *
 * Python struct-like binary data packing and unpacking for network protocol.
 */

// Pack data according to format string
export function pack(format: string, ...values: any[]): number[] {
  const result: number[] = [];
  let valueIndex = 0;

  for (let i = 0; i < format.length; i++) {
    const type = format[i];
    const value = values[valueIndex++];

    switch (type) {
      case 'B': // Unsigned byte
        result.push(value & 0xff);
        break;
      case 'H': // Unsigned short (2 bytes)
        result.push((value >> 8) & 0xff);
        result.push(value & 0xff);
        break;
      case 'f': // Float (4 bytes) - simplified
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setFloat32(0, value, false); // big-endian
        for (let j = 0; j < 4; j++) {
          result.push(view.getUint8(j));
        }
        break;
    }
  }

  return result;
}

// Unpack data according to format string
export function unpack(format: string, data: number[], offset: number = 0): [any[], number] {
  const result: any[] = [];
  let pos = offset;

  for (let i = 0; i < format.length; i++) {
    const type = format[i];

    switch (type) {
      case 'B': // Unsigned byte
        result.push(data[pos++]);
        break;
      case 'H': // Unsigned short (2 bytes)
        result.push((data[pos] << 8) | data[pos + 1]);
        pos += 2;
        break;
      case 'f': // Float (4 bytes)
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        for (let j = 0; j < 4; j++) {
          view.setUint8(j, data[pos++]);
        }
        result.push(view.getFloat32(0, false)); // big-endian
        break;
    }
  }

  return [result, pos - offset];
}
