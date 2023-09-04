import {
  AnchorProvider,
  BorshCoder,
  EventParser,
  Program,
  workspace,
} from "@coral-xyz/anchor";
import { assert, expect } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  createMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  mintTo,
  createAccount,
} from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { PreAuthorizedDebitV1 } from "../../target/types/pre_authorized_debit_v1";

import "./setup";
import {
  derivePreAuthorization,
  fundAccounts,
  waitForTxToConfirm,
} from "./utils";

// TODO(Mocha): Split this test file into multiple test files to take
// advantage of parallel test execution
describe("pre-authorized-debit-v1#close-pre-authorization", () => {
  const program =
    workspace.PreAuthorizedDebitV1 as Program<PreAuthorizedDebitV1>;
  const eventParser = new EventParser(
    program.programId,
    new BorshCoder(program.idl),
  );
  const provider = program.provider as AnchorProvider;

  let owner: Keypair;
  let mintAuthority: Keypair;
  let debitAuthority: Keypair;

  const activationUnixTimestamp = Math.floor(new Date().getTime() / 1e3) - 60; // -60 seconds from now
  const expirationUnixTimestamp = activationUnixTimestamp + 10 * 24 * 60 * 60; // +10 days from activation

  beforeEach(async () => {
    mintAuthority = new Keypair();
    owner = new Keypair();
    debitAuthority = new Keypair();
    await fundAccounts(
      provider,
      [owner.publicKey, mintAuthority.publicKey, debitAuthority.publicKey],
      500_000_000,
    );
  });

  [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].forEach((tokenProgramId) => {
    context(`with token program ${tokenProgramId.toString()}`, () => {
      let mint: PublicKey;
      let tokenAccount: PublicKey;

      ["one time", "recurring"].forEach((preAuthType: string) => {
        context(`with a ${preAuthType} pre authorization`, () => {
          let preAuthorization: PublicKey;

          beforeEach(async () => {
            mint = await createMint(
              provider.connection,
              mintAuthority,
              mintAuthority.publicKey,
              null,
              6,
              new Keypair(),
              undefined,
              tokenProgramId,
            );
            tokenAccount = await createAccount(
              provider.connection,
              mintAuthority,
              mint,
              owner.publicKey,
              new Keypair(),
              undefined,
              tokenProgramId,
            );
            await mintTo(
              provider.connection,
              mintAuthority,
              mint,
              tokenAccount,
              mintAuthority,
              1_000_000,
              undefined,
              undefined,
              tokenProgramId,
            );
            preAuthorization = derivePreAuthorization(
              tokenAccount,
              debitAuthority.publicKey,
              program.programId,
            );
            const preAuthVariant =
              preAuthType === "one time"
                ? {
                    oneTime: {
                      amountAuthorized: new anchor.BN(100e6),
                      expiryUnixTimestamp: new anchor.BN(
                        expirationUnixTimestamp,
                      ),
                    },
                  }
                : {
                    recurring: {
                      repeatFrequencySeconds: new anchor.BN(30),
                      recurringAmountAuthorized: new anchor.BN(10e6),
                      numCycles: null,
                      resetEveryCycle: false,
                    },
                  };

            await program.methods
              .initPreAuthorization({
                variant: preAuthVariant,
                debitAuthority: debitAuthority.publicKey,
                activationUnixTimestamp: new anchor.BN(activationUnixTimestamp),
              })
              .accounts({
                payer: mintAuthority.publicKey,
                owner: owner.publicKey,
                tokenAccount: tokenAccount,
                preAuthorization: preAuthorization,
                systemProgram: SystemProgram.programId,
              })
              .signers([owner, mintAuthority])
              .rpc();
          });

          ["owner", "debit authority"].forEach((closeAuthority: string) => {
            context(`as the ${closeAuthority}`, () => {
              it(`should close the pre authorization`, async () => {
                const closeAuthorityKeypair =
                  closeAuthority === "owner" ? owner : debitAuthority;
                const tokenAccountDataBefore = await getAccount(
                  provider.connection,
                  tokenAccount,
                  undefined,
                  tokenProgramId,
                );
                expect(tokenAccountDataBefore.amount.toString()).to.equal(
                  "1000000",
                );

                const ownerAccountInfoBefore =
                  await provider.connection.getAccountInfo(owner.publicKey);
                assert(ownerAccountInfoBefore);

                const signature = await program.methods
                  .closePreAuthorization()
                  .accounts({
                    receiver: owner.publicKey,
                    authority: closeAuthorityKeypair.publicKey,
                    tokenAccount: tokenAccount,
                    preAuthorization: preAuthorization,
                  })
                  .signers([closeAuthorityKeypair])
                  .rpc();
                const tx = await waitForTxToConfirm(
                  signature,
                  provider.connection,
                );
                assert(tx.meta?.logMessages);

                // verify events
                const eventGenerator = eventParser.parseLogs(
                  tx.meta.logMessages,
                );
                const events = [...eventGenerator];
                expect(events.length).to.equal(1);
                const [closePreAuthEvent] = events;
                expect(closePreAuthEvent).to.not.be.null;
                if (preAuthType === "one time") {
                  expect(closePreAuthEvent.name).to.equal(
                    "OneTimePreAuthorizationClosed",
                  );
                } else {
                  expect(closePreAuthEvent.name).to.equal(
                    "RecurringPreAuthorizationClosed",
                  );
                }
                expect(Object.keys(closePreAuthEvent.data).length).to.equal(1);
                const closePreAuthEventData = closePreAuthEvent.data
                  .data as any;
                expect(Object.keys(closePreAuthEventData).length).to.equal(6);

                expect(
                  closePreAuthEventData.debitAuthority!.toString(),
                ).to.equal(debitAuthority.publicKey.toString());
                expect(
                  closePreAuthEventData.closingAuthority!.toString(),
                ).to.equal(closeAuthorityKeypair.publicKey.toString());
                expect(
                  closePreAuthEventData.tokenAccountOwner!.toString(),
                ).to.equal(owner.publicKey.toString());
                expect(closePreAuthEventData.receiver!.toString()).to.equal(
                  owner.publicKey.toString(),
                );
                expect(closePreAuthEventData.tokenAccount!.toString()).to.equal(
                  tokenAccount.toString(),
                );
                expect(
                  closePreAuthEventData.preAuthorization!.toString(),
                ).to.equal(preAuthorization.toString());

                // verify sol balances
                const ownerAccountInfoAfter =
                  await provider.connection.getAccountInfo(owner.publicKey);
                assert(ownerAccountInfoAfter);
                // should refund the owner
                expect(ownerAccountInfoAfter.lamports).to.be.greaterThan(
                  ownerAccountInfoBefore.lamports,
                );

                // verify token account balance is unchanged
                const tokenAccountDataAfter = await getAccount(
                  provider.connection,
                  tokenAccount,
                  undefined,
                  tokenProgramId,
                );
                expect(tokenAccountDataAfter.amount.toString()).to.equal(
                  "1000000",
                );
              });
            });
          });

          it("should throw an error if an token account does not match the pre authorization", async () => {
            const newTokenAccount = await createAccount(
              provider.connection,
              mintAuthority,
              mint,
              owner.publicKey,
              new Keypair(),
              undefined,
              tokenProgramId,
            );
            await expect(
              program.methods
                .closePreAuthorization()
                .accounts({
                  receiver: owner.publicKey,
                  authority: owner.publicKey,
                  tokenAccount: newTokenAccount,
                  preAuthorization: preAuthorization,
                })
                .signers([owner])
                .rpc(),
            ).to.eventually.be.rejectedWith(
              /AnchorError caused by account: pre_authorization. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated./,
            );
          });

          it("should throw if the authority is invalid", async () => {
            await expect(
              program.methods
                .closePreAuthorization()
                .accounts({
                  receiver: owner.publicKey,
                  authority: mintAuthority.publicKey,
                  tokenAccount: tokenAccount,
                  preAuthorization: preAuthorization,
                })
                .signers([mintAuthority])
                .rpc(),
            ).to.eventually.be.rejectedWith(
              /AnchorError caused by account: authority. Error Code: PreAuthorizationCloseUnauthorized. Error Number: 6007. Error Message: Pre-authorization can only be closed by debit_authority or token_account.owner./,
            );
          });

          it("should throw if the receiver is not the token account owner", async () => {
            await expect(
              program.methods
                .closePreAuthorization()
                .accounts({
                  receiver: mintAuthority.publicKey,
                  authority: mintAuthority.publicKey,
                  tokenAccount: tokenAccount,
                  preAuthorization: preAuthorization,
                })
                .signers([mintAuthority])
                .rpc(),
            ).to.eventually.be.rejectedWith(
              /AnchorError caused by account: receiver. Error Code: OnlyTokenAccountOwnerCanReceiveClosePreAuthFunds. Error Number: 6005. Error Message: Only token account owner can receive funds from closing pre-authorization account./,
            );
          });
        });
      });
    });
  });
});