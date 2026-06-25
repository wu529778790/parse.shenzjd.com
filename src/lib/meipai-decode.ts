/**
 * 美拍视频 bs64 参数解码
 * 参考: https://github.com/nicehash/NiceHashQuickMiner/blob/master/excavator/minerstat/excavator_api.c
 */

function reverseString(s: string): string {
  return [...s].reverse().join("");
}

function getHex(videoBs64: string): { hex_1: number; str_1: string } {
  const hexStr = reverseString(videoBs64).slice(-10);
  const dec = parseInt(hexStr, 16);
  const hex_1 = Math.floor(dec / 1000);
  const str_1 = videoBs64.slice(0, -10);
  return { hex_1, str_1 };
}

function getDec(n: number): { pre: number; tail: string[] } {
  const strN = n.toString();
  const pre = parseInt(strN.slice(0, 3));
  const tail = strN.slice(3).split("").reverse();
  return { pre, tail };
}

function subStr(s: string, n: number): string {
  return reverseString(s).slice(0, n).split("").reverse().join("");
}

function getPos(s: string, arr: string[]): number {
  let result = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== "0") {
      result = i;
      break;
    }
  }
  return result + 1 + parseInt(arr.reverse().join(""), 10);
}

export function decodeMeipaiVideoBs64(videoBs64: string): string {
  const hex = getHex(videoBs64);
  const dec = getDec(hex.hex_1);
  const d = subStr(hex.str_1, dec.pre);
  const p = getPos(d, [...dec.tail]);
  const kk = subStr(d, p);
  const decodeBs64 = Buffer.from(kk, "base64").toString("utf8");
  return `https:${decodeBs64}`;
}
