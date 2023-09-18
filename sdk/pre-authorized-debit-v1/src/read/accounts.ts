import { PublicKey } from "@solana/web3.js";

export type SmartDelegateAccount = {
  bump: number;
};

export type PreAuthorizationAccount = {
  bump: number;
  tokenAccount: PublicKey;
  debitAuthority: PublicKey;
  activationUnixTimestamp: bigint;
  paused: boolean;
  variant:
    | {
        type: "oneTime";
        amountAuthorized: bigint;
        amountDebited: bigint;
        expiryUnixTimestamp: bigint;
      }
    | {
        type: "recurring";
        recurringAmountAuthorized: bigint;
        repeatFrequencySeconds: bigint;
        resetEveryCycle: boolean;
        numCycles: bigint | null;
        amountDebitedTotal: bigint;
        amountDebitedLastCycle: bigint;
        lastDebitedCycle: bigint;
      };
};

export const SMART_DELEGATE_DISCRIMINATOR = Buffer.from([
  47, 189, 254, 31, 76, 172, 82, 107,
]);

export const PRE_AUTHORIZATION_DISCRIMINATOR = Buffer.from([
  94, 236, 32, 243, 45, 211, 69, 50,
]);
