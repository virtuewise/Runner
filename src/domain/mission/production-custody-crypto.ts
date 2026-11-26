export interface CustodyCrypto {
  randomToken(bytes: number): string;
  hashToken(token: string): Promise<string>;
  equalDigest(leftHex: string, rightHex: string): boolean;
}

/** Web Crypto implementation; available in supported Node 22+ runtimes. */
export const productionCustodyCrypto: CustodyCrypto = {
  randomToken(bytes: number): string {
    if (!Number.isSafeInteger(bytes) || bytes < 32 || bytes > 128) throw new Error("Token entropy must be 256–1024 bits");
    const data = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(data);
    return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join("");
  },
  async hashToken(token: string): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  },
  equalDigest(leftHex: string, rightHex: string): boolean {
    if (!/^[a-f0-9]{64}$/i.test(leftHex) || !/^[a-f0-9]{64}$/i.test(rightHex)) return false;
    let difference = 0;
    for (let index = 0; index < 64; index += 1)
      difference |= leftHex.charCodeAt(index) ^ rightHex.charCodeAt(index);
    return difference === 0;
  },
};
