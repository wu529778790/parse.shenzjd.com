/**
 * 美拍分享页 data-video 解码
 */

function reverseString(s) {
  return [...s].reverse().join("");
}

function getHex(s) {
  const length = s.length;
  const hex = s.slice(0, 4);
  const str = s.slice(4, length);
  return { hex_1: reverseString(hex), str_1: str };
}

function getDec(hex) {
  const n = parseInt(hex, 16);
  if (Number.isNaN(n)) {
    throw new Error("invalid hex");
  }
  const intN = n;
  const strN = String(intN);
  const length = strN.length;
  const pre = [];
  const tail = [];
  let tmpN = intN;
  for (let i = 0; i <= length - 1; i++) {
    const tmp = tmpN % 10;
    tmpN = (tmpN - tmp) / 10;
    if (i >= length - 2) {
      pre.unshift(tmp);
    } else {
      tail.unshift(tmp);
    }
  }
  return { pre, tail };
}

function subStr(s, b) {
  if (b.length < 2) {
    throw new Error("substr param b length is not correct");
  }
  const length = s.length;
  const c = s.slice(0, b[0]);
  const d = s.slice(b[0], b[0] + b[1]);
  const temp = s.slice(b[0], length).split(d).join("");
  return c + temp;
}

function getPos(s, b) {
  if (b.length < 2) {
    throw new Error("getpos param b length is not correct");
  }
  b[0] = s.length - b[0] - b[1];
  return b;
}

export function decodeMeipaiVideoBs64(videoBs64) {
  const hex = getHex(videoBs64);
  const dec = getDec(hex.hex_1);
  let d = subStr(hex.str_1, dec.pre);
  const p = getPos(d, [...dec.tail]);
  const kk = subStr(d, p);
  const decodeBs64 = Buffer.from(kk, "base64").toString("utf8");
  return `https:${decodeBs64}`;
}
