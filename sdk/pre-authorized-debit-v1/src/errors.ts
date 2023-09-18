import { PublicKey } from "@solana/web3.js";

export class CustomError extends Error {
  constructor(rpcUrl: string, msg: string) {
    super(`${msg} (rpc: ${rpcUrl})`);
  }
}

export class IdlNotFoundOnChainError extends CustomError {
  constructor(rpcUrl: string, programId: PublicKey) {
    super(rpcUrl, `IDL not found on-chain for program ${programId.toBase58()}`);
  }
}

export class TokenAccountDoesNotExist extends CustomError {
  constructor(rpcUrl: string, tokenAccountPubkey: PublicKey) {
    super(rpcUrl, `Token account doesn't exist: ${tokenAccountPubkey}`);
  }
}
