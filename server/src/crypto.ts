// AES-128 encryption/decryption matching camera's function.js

const AES_Sbox = [
  99, 124, 119, 123, 242, 107, 111, 197, 48, 1, 103, 43, 254, 215, 171, 118,
  202, 130, 201, 125, 250, 89, 71, 240, 173, 212, 162, 175, 156, 164, 114, 192,
  183, 253, 147, 38, 54, 63, 247, 204, 52, 165, 229, 241, 113, 216, 49, 21, 4,
  199, 35, 195, 24, 150, 5, 154, 7, 18, 128, 226, 235, 39, 178, 117, 9, 131, 44,
  26, 27, 110, 90, 160, 82, 59, 214, 179, 41, 227, 47, 132, 83, 209, 0, 237, 32,
  252, 177, 91, 106, 203, 190, 57, 74, 76, 88, 207, 208, 239, 170, 251, 67, 77,
  51, 133, 69, 249, 2, 127, 80, 60, 159, 168, 81, 163, 64, 143, 146, 157, 56,
  245, 188, 182, 218, 33, 16, 255, 243, 210, 205, 12, 19, 236, 95, 151, 68, 23,
  196, 167, 126, 61, 100, 93, 25, 115, 96, 129, 79, 220, 34, 42, 144, 136, 70,
  238, 184, 20, 222, 94, 11, 219, 224, 50, 58, 10, 73, 6, 36, 92, 194, 211, 172,
  98, 145, 149, 228, 121, 231, 200, 55, 109, 141, 213, 78, 169, 108, 86, 244,
  234, 101, 122, 174, 8, 186, 120, 37, 46, 28, 166, 180, 198, 232, 221, 116, 31,
  75, 189, 139, 138, 112, 62, 181, 102, 72, 3, 246, 14, 97, 53, 87, 185, 134,
  193, 29, 158, 225, 248, 152, 17, 105, 217, 142, 148, 155, 30, 135, 233, 206,
  85, 40, 223, 140, 161, 137, 13, 191, 230, 66, 104, 65, 153, 45, 15, 176, 84,
  187, 22,
];
const AES_ShiftRowTab = [0, 5, 10, 15, 4, 9, 14, 3, 8, 13, 2, 7, 12, 1, 6, 11];

let AES_Sbox_Inv: number[];
let AES_ShiftRowTab_Inv: number[];
let AES_xtime: number[];

function AES_Init() {
  AES_Sbox_Inv = new Array(256);
  for (let i = 0; i < 256; i++) AES_Sbox_Inv[AES_Sbox[i]] = i;
  AES_ShiftRowTab_Inv = new Array(16);
  for (let i = 0; i < 16; i++) AES_ShiftRowTab_Inv[AES_ShiftRowTab[i]] = i;
  AES_xtime = new Array(256);
  for (let i = 0; i < 128; i++) {
    AES_xtime[i] = i << 1;
    AES_xtime[128 + i] = (i << 1) ^ 0x1b;
  }
}

function AES_SubBytes(state: number[], sbox: number[]) {
  for (let i = 0; i < 16; i++) state[i] = sbox[state[i]];
}

function AES_AddRoundKey(state: number[], rkey: number[]) {
  for (let i = 0; i < 16; i++) state[i] ^= rkey[i];
}

function AES_ShiftRows(state: number[], shifttab: number[]) {
  const h = state.slice();
  for (let i = 0; i < 16; i++) state[i] = h[shifttab[i]];
}

function AES_MixColumns(state: number[]) {
  for (let i = 0; i < 16; i += 4) {
    const s0 = state[i],
      s1 = state[i + 1],
      s2 = state[i + 2],
      s3 = state[i + 3];
    const h = s0 ^ s1 ^ s2 ^ s3;
    state[i] ^= h ^ AES_xtime[s0 ^ s1];
    state[i + 1] ^= h ^ AES_xtime[s1 ^ s2];
    state[i + 2] ^= h ^ AES_xtime[s2 ^ s3];
    state[i + 3] ^= h ^ AES_xtime[s3 ^ s0];
  }
}

function AES_EncryptBlock(block: number[], key: number[]): number[] {
  const l = key.length;
  AES_AddRoundKey(block, key.slice(0, 16));
  let i: number;
  for (i = 16; i < l - 16; i += 16) {
    AES_SubBytes(block, AES_Sbox);
    AES_ShiftRows(block, AES_ShiftRowTab);
    AES_MixColumns(block);
    AES_AddRoundKey(block, key.slice(i, i + 16));
  }
  AES_SubBytes(block, AES_Sbox);
  AES_ShiftRows(block, AES_ShiftRowTab);
  AES_AddRoundKey(block, key.slice(i, l));
  return block;
}

function hexstr2array(input: string, length: number): number[] {
  const output = new Array(length);
  for (let i = 0; i < length; i++) {
    if (i < input.length / 2) output[i] = parseInt(input.substr(i * 2, 2), 16);
    else output[i] = 0;
  }
  return output;
}

function array2hexstr(input: number[]): string {
  let output = "";
  for (let i = 0; i < input.length; i++) {
    const tmp = input[i].toString(16);
    output += tmp.length === 1 ? "0" + tmp : tmp;
  }
  return output;
}

function str2hexstr(input: string): string {
  let output = "";
  for (let a = 0; a < input.length; a++) {
    output += input.charCodeAt(a).toString(16);
  }
  return output;
}

export function encryptPass(password: string, sessionKey: string): string {
  const inputHex = str2hexstr(password);
  const keyHex = str2hexstr(sessionKey);
  const privateKeyByte = hexstr2array(keyHex, 32);
  const passwdByte = hexstr2array(inputHex, 64);
  const outputByte = new Array(64);

  AES_Init();
  for (let i = 0; i < 4; i++) {
    const block = new Array(16);
    for (let j = 0; j < 16; j++) block[j] = passwdByte[i * 16 + j];
    const encrypted = AES_EncryptBlock(block, privateKeyByte);
    for (let j = 0; j < 16; j++) outputByte[i * 16 + j] = encrypted[j];
  }

  return array2hexstr(outputByte);
}

export function decryptPass(encrypted: string, sessionKey: string): string {
  const keyHex = str2hexstr(sessionKey);
  const privateKeyByte = hexstr2array(keyHex, 32);
  const encryptedByte = hexstr2array(encrypted, 64);
  const outputByte = new Array(64);

  AES_Init();
  const AES_Sbox_Inv_local = AES_Sbox_Inv;
  const AES_ShiftRowTab_Inv_local = AES_ShiftRowTab_Inv;

  for (let i = 0; i < 4; i++) {
    const block = new Array(16);
    for (let j = 0; j < 16; j++) block[j] = encryptedByte[i * 16 + j];

    const key = privateKeyByte;
    const l = key.length;
    AES_AddRoundKey(block, key.slice(l - 16, l));
    AES_ShiftRows(block, AES_ShiftRowTab_Inv_local);
    AES_SubBytes(block, AES_Sbox_Inv_local);
    for (let k = l - 32; k >= 16; k -= 16) {
      AES_AddRoundKey(block, key.slice(k, k + 16));
      for (let m = 0; m < 16; m += 4) {
        const s0 = block[m],
          s1 = block[m + 1],
          s2 = block[m + 2],
          s3 = block[m + 3];
        const h = s0 ^ s1 ^ s2 ^ s3;
        const xh = AES_xtime[h];
        const h1 = AES_xtime[AES_xtime[xh ^ s0 ^ s2]] ^ h;
        const h2 = AES_xtime[AES_xtime[xh ^ s1 ^ s3]] ^ h;
        block[m] ^= h1 ^ AES_xtime[s0 ^ s1];
        block[m + 1] ^= h2 ^ AES_xtime[s1 ^ s2];
        block[m + 2] ^= h1 ^ AES_xtime[s2 ^ s3];
        block[m + 3] ^= h2 ^ AES_xtime[s3 ^ s0];
      }
      AES_ShiftRows(block, AES_ShiftRowTab_Inv_local);
      AES_SubBytes(block, AES_Sbox_Inv_local);
    }
    AES_AddRoundKey(block, key.slice(0, 16));

    for (let j = 0; j < 16; j++) outputByte[i * 16 + j] = block[j];
  }

  const hex = array2hexstr(outputByte);
  let result = "";
  for (let i = 0; i < hex.length; i += 2) {
    const hexByte = hex.substr(i, 2);
    if (hexByte === "00") break;
    result += String.fromCharCode(parseInt(hexByte, 16));
  }
  return result;
}
