import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solfundme } from "../target/types/solfundme";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("solfundme", () => {
  // anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(anchor.AnchorProvider.local());
  const LAMPORTS_PER_SOL = 1000000000;
  const program = anchor.workspace.Solfundme as Program<Solfundme>;

  const campaignCreator = anchor.web3.Keypair.generate();
  const contributor = anchor.web3.Keypair.generate();
  let campaignPDA: PublicKey;
  let campaignPDABump: number;
  const goalAmount = 1000;
  // 20 seconds from now
  const endDate = new Date().getTime() / 1000 + 20;

  before(async () => {
    // Setup accounts

    // Airdrop SOL to accounts
    await program.provider.connection.confirmTransaction(
      await program.provider.connection.requestAirdrop(
        campaignCreator.publicKey,
        LAMPORTS_PER_SOL * 2
      ),
      "confirmed"
    );
    await program.provider.connection.confirmTransaction(
      await program.provider.connection.requestAirdrop(
        contributor.publicKey,
        LAMPORTS_PER_SOL * 2
      ),
      "confirmed"
    );
  });

  it("Creates a campaign", async () => {
    [campaignPDA, campaignPDABump] = await PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode("create_campaign"),
        campaignCreator.publicKey.toBuffer(),
      ],
      program.programId
    );

    console.log("PDA", campaignPDA);
    console.log("bump", campaignPDABump);

    const tx = await program.methods
      .createCampaign({
        goalAmount,
        endDate,
      })
      .accounts({
        signer: campaignCreator.publicKey,
        campaign: campaignPDA,
      })
      .rpc();

    // wait for tx
    // await program.provider.connection.confirmTransaction(tx);

    const campaign = await program.account.campaign.fetch(campaignPDA);
    assert.equal(campaign.goalAmount.toNumber(), goalAmount);
    assert.equal(campaign.endDate.toNumber(), endDate);
    assert.equal(campaign.totalContributed.toNumber(), 0);
  });

  // it("Contributes to a campaign", async () => {
  //   const contributeAmount = 500;
  //   await program.rpc.contribute(
  //     {
  //       amount: contributeAmount,
  //     },
  //     {
  //       accounts: {
  //         campaign: campaignCreator.publicKey,
  //         contributor: contributor.publicKey,
  //         signer: contributor.publicKey,
  //         systemProgram: anchor.web3.SystemProgram.programId,
  //       },
  //       signers: [contributor],
  //     }
  //   );
  //
  //   const campaign = await program.account.campaign.fetch(
  //     campaignCreator.publicKey
  //   );
  //   assert.equal(campaign.totalContributed.toNumber(), contributeAmount);
  //   const contributorAccount = await program.account.contributor.fetch(
  //     contributor.publicKey
  //   );
  //   assert.equal(contributorAccount.amount.toNumber(), contributeAmount);
  // });

  // it("Withdraws by the creator after campaign ends successfully", async () => {
  //   // Simulate time passing and campaign ending
  //   await new Promise((resolve) => setTimeout(resolve, 1000));
  //
  //   await program.rpc.withdrawCreator(
  //     {},
  //     {
  //       accounts: {
  //         campaign: campaignCreator.publicKey,
  //         signer: campaignCreator.publicKey,
  //       },
  //       signers: [campaignCreator],
  //     }
  //   );
  //
  //   const campaign = await program.account.campaign.fetch(
  //     campaignCreator.publicKey
  //   );
  //   assert.equal(campaign.totalContributed.toNumber(), 0);
  // });

  // it("Refunds contributor if goal not met", async () => {
  //   // Assuming the campaign did not meet its goal
  //   await program.rpc.refundContributer(
  //     {},
  //     {
  //       accounts: {
  //         campaign: campaignCreator.publicKey,
  //         contributor: contributor.publicKey,
  //         signer: campaignCreator.publicKey,
  //       },
  //       signers: [campaignCreator],
  //     }
  //   );
  //
  //   const contributorAccount = await program.account.contributor.fetch(
  //     contributor.publicKey
  //   );
  //   assert.equal(contributorAccount.amount.toNumber(), 0);
  // });
});
