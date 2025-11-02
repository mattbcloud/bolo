/**
 * A base64 decoder, because we don't have one in the browser.
 * The output is an array of byte values as numbers, much like a node.js Buffer.
 *
 * Note that this is a very simple implementation. It doesn't cope with whitespace, and breaks on
 * otherwise invalid input. For example, it's known to break when the padding character is injected
 * in the middle.
 */

export function decodeBase64(input: string): number[] {
  if (input.length % 4 !== 0) {
    throw new Error('Invalid base64 input length, not properly padded?');
  }

  let outputLength = (input.length / 4) * 3;
  const tail = input.substr(-2);
  if (tail[0] === '=') outputLength--;
  if (tail[1] === '=') outputLength--;

  const output = new Array(outputLength);
  const quad = new Array(4);
  let outputIndex = 0;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const cc = c.charCodeAt(0);

    // Gather the numerical values of the next group of 4 characters.
    const quadIndex = i % 4;
    quad[quadIndex] = (() => {
      if (65 <= cc && cc <= 90) return cc - 65; // A-Z
      else if (97 <= cc && cc <= 122) return cc - 71; // a-z
      else if (48 <= cc && cc <= 57) return cc + 4; // 0-9
      else if (cc === 43) return 62; // +
      else if (cc === 47) return 63; // /
      else if (cc === 61) return -1; // Padding
      else throw new Error(`Invalid base64 input character: ${c}`);
    })();

    // Did we complete a quad? If so, calculate the octet values and add them to the output.
    // We take bits from the character values as follows: 000000 001111 111122 222222
    if (quadIndex !== 3) continue;

    output[outputIndex++] = ((quad[0] & 0x3f) << 2) + ((quad[1] & 0x30) >> 4);
    if (quad[2] !== -1) {
      output[outputIndex++] = ((quad[1] & 0x0f) << 4) + ((quad[2] & 0x3c) >> 2);
    }
    if (quad[3] !== -1) {
      output[outputIndex++] = ((quad[2] & 0x03) << 6) + (quad[3] & 0x3f);
    }
  }

  // Return output.
  return output;
}
