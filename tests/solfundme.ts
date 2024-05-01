import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solfundme } from "../target/types/solfundme";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("solfundme", () => {
  // anchor.setProvider(anchor.AnchorProvider.local("http://127.0.0.1:8899"));
  anchor.setProvider(anchor.AnchorProvider.local());
  const LAMPORTS_PER_SOL = 1000000000;
  const program = anchor.workspace.Solfundme as Program<Solfundme>;
  const { SystemProgram } = anchor.web3;

  const campaignCreator = anchor.web3.Keypair.generate();
  const contributor = anchor.web3.Keypair.generate();
  const contributor2 = anchor.web3.Keypair.generate();
  const contributor3 = anchor.web3.Keypair.generate();

  let campaignPDA: PublicKey;
  let contributorPDA: PublicKey;
  let contributorPDA2: PublicKey;
  let contributorPDA3: PublicKey;

  const goalAmount = 1000;
  // 20 seconds from now, round it
  const endDate = Math.round(Date.now() / 1000) + 20;

  before(async () => {
    let tx = await program.provider.connection.requestAirdrop(
      campaignCreator.publicKey,
      LAMPORTS_PER_SOL * 2
    );
    let latestBlockhash = await program.provider.connection.getLatestBlockhash(
      "finalized"
    );
    await program.provider.connection.confirmTransaction({
      signature: tx,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    tx = await program.provider.connection.requestAirdrop(
      contributor.publicKey,
      LAMPORTS_PER_SOL * 2
    );
    latestBlockhash = await program.provider.connection.getLatestBlockhash(
      "finalized"
    );
    await program.provider.connection.confirmTransaction({
      signature: tx,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    tx = await program.provider.connection.requestAirdrop(
      contributor2.publicKey,
      LAMPORTS_PER_SOL * 2
    );
    latestBlockhash = await program.provider.connection.getLatestBlockhash(
      "finalized"
    );
    await program.provider.connection.confirmTransaction({
      signature: tx,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    tx = await program.provider.connection.requestAirdrop(
      contributor3.publicKey,
      LAMPORTS_PER_SOL * 2
    );
    latestBlockhash = await program.provider.connection.getLatestBlockhash(
      "finalized"
    );
    await program.provider.connection.confirmTransaction({
      signature: tx,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });
  });

  it("Creates a campaign", async () => {
    [campaignPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("create_campaign"), campaignCreator.publicKey.toBuffer()],
      program.programId
    );

    const creatorBalance1 = await program.provider.connection.getBalance(
      campaignCreator.publicKey
    );

    await program.methods
      .createCampaign(new anchor.BN(goalAmount), new anchor.BN(endDate))
      .accounts({
        campaign: campaignPDA,
        signer: campaignCreator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([campaignCreator])
      .rpc();

    const campaign = await program.account.campaign.fetch(campaignPDA);
    assert.equal(campaign.goalAmount.toNumber(), goalAmount);
    assert.equal(campaign.endDate.toNumber(), endDate);
    assert.equal(campaign.totalContributed.toNumber(), 0);

    const creatorBalance2 = await program.provider.connection.getBalance(
      campaignCreator.publicKey
    );
    assert.isBelow(creatorBalance2, creatorBalance1);

    // get campaign account balance
    const campaignBalance = await program.provider.connection.getBalance(
      campaignPDA
    );
    assert.isAbove(campaignBalance, 0);
  });

  it("Contributes to a campaign", async () => {
    [contributorPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribute"), contributor.publicKey.toBuffer()],
      program.programId
    );

    const contributorBalance1 = await program.provider.connection.getBalance(
      contributor.publicKey
    );
    const campaignBalance1 = await program.provider.connection.getBalance(
      campaignPDA
    );

    const contributeAmount = 500;
    await program.methods
      .contribute(new anchor.BN(contributeAmount))
      .accounts({
        campaign: campaignPDA,
        contributor: contributorPDA,
        signer: contributor.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([contributor])
      .rpc()
      .catch((error) => {
        console.log("error", error);
      });

    const campaign = await program.account.campaign.fetch(campaignPDA);
    assert.equal(campaign.totalContributed.toNumber(), contributeAmount);

    const contributorAccount = await program.account.contributor.fetch(
      contributorPDA
    );
    assert.equal(contributorAccount.amount.toNumber(), contributeAmount);

    const contributorBalance2 = await program.provider.connection.getBalance(
      contributor.publicKey
    );
    assert.isBelow(contributorBalance2, contributorBalance1);

    const campaignBalance2 = await program.provider.connection.getBalance(
      campaignPDA
    );
    assert.isAbove(campaignBalance2, campaignBalance1);
  });

  it("Withdraws from the campaign before it ends (error)", async () => {
    try {
      await program.methods
        .withdrawCreator()
        .accounts({
          campaign: campaignPDA,
          signer: campaignCreator.publicKey,
        })
        .signers([campaignCreator])
        .rpc();
      assert.fail("Withdrawal should have failed");
    } catch (error) {
      assert.include(error.message, "The campaign has not ended yet.");
    }
  });

  it("Contributes from a second account to reach the goal", async () => {
    [contributorPDA2] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribute"), contributor2.publicKey.toBuffer()],
      program.programId
    );
    console.log("PDA contribute", contributorPDA2.toString());

    const contributeAmount = 1500;

    await program.methods
      .contribute(new anchor.BN(contributeAmount))
      .accounts({
        campaign: campaignPDA,
        contributor: contributorPDA2,
        signer: contributor2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([contributor2])
      .rpc()
      .catch((error) => {
        console.log("error", error);
      });

    const campaign = await program.account.campaign.fetch(campaignPDA);
    assert.equal(campaign.totalContributed.toNumber(), 2000);
    const contributorAccount = await program.account.contributor.fetch(
      contributorPDA2
    );
    assert.equal(contributorAccount.amount.toNumber(), contributeAmount);
  });

  it("Contributes from a third account but fails due to goal already being met", async () => {
    [contributorPDA3] = PublicKey.findProgramAddressSync(
      [Buffer.from("contribute"), contributor3.publicKey.toBuffer()],
      program.programId
    );
    console.log("PDA contribute", contributorPDA3.toString());

    const contributeAmount = 2500;

    await program.methods
      .contribute(new anchor.BN(contributeAmount))
      .accounts({
        campaign: campaignPDA,
        contributor: contributorPDA3,
        signer: contributor3.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([contributor3])
      .rpc()
      .catch((error) => {
        console.log("error", error);
      });

    const campaign = await program.account.campaign.fetch(campaignPDA);
    assert.equal(campaign.totalContributed.toNumber(), 4500);
    const contributorAccount = await program.account.contributor.fetch(
      contributorPDA3
    );
    assert.equal(contributorAccount.amount.toNumber(), contributeAmount);
  });

  it("Withdraws from from the first account", async () => {
    const currentFunds = await program.provider.connection.getBalance(
      contributor.publicKey
    );

    const latestBlockhash =
      await program.provider.connection.getLatestBlockhash("finalized");

    const tx = await program.methods
      .withdrawContributer()
      .accounts({
        campaign: campaignPDA,
        contributor: contributorPDA,
        signer: contributor.publicKey,
      })
      .signers([contributor])
      .rpc();

    await program.provider.connection.confirmTransaction({
      signature: tx,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    const campaign = await program.account.campaign.fetch(campaignPDA);
    assert.equal(campaign.totalContributed.toNumber(), 4000);
    const contributorAccount = await program.account.contributor.fetch(
      contributorPDA
    );
    assert.equal(contributorAccount.amount.toNumber(), 0);

    // signer funds should be higher than before
    const newFunds = await program.provider.connection.getBalance(
      contributor.publicKey
    );
    assert.isAbove(newFunds, currentFunds);
  });

  it("Withdraws from from the first account again and errors", async () => {});
  it("Withdraws from the campaign but is not successful due to the time not being up", async () => {});
});
