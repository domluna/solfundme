import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solfundme } from "../target/types/solfundme";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";

async function airdrop(
  provider: anchor.Provider,
  publicKey: PublicKey,
  amount: number
) {
  const tx = await provider.connection.requestAirdrop(publicKey, amount);
  const latestBlockhash = await provider.connection.getLatestBlockhash(
    "finalized"
  );
  await provider.connection.confirmTransaction({
    signature: tx,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });
}

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

  const goalAmount = LAMPORTS_PER_SOL * 3;
  const endDate = Math.round(Date.now() / 1000) + 10;

  before(async () => {
    await airdrop(
      program.provider,
      campaignCreator.publicKey,
      LAMPORTS_PER_SOL * 5
    );
    await airdrop(
      program.provider,
      contributor.publicKey,
      LAMPORTS_PER_SOL * 5
    );
    await airdrop(
      program.provider,
      contributor2.publicKey,
      LAMPORTS_PER_SOL * 5
    );
    await airdrop(
      program.provider,
      contributor3.publicKey,
      LAMPORTS_PER_SOL * 5
    );
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
      [
        Buffer.from("contribute"),
        campaignPDA.toBuffer(),
        contributor.publicKey.toBuffer(),
      ],
      program.programId
    );

    const contributorBalance1 = await program.provider.connection.getBalance(
      contributor.publicKey
    );
    const campaignBalance1 = await program.provider.connection.getBalance(
      campaignPDA
    );

    const contributeAmount = LAMPORTS_PER_SOL * 1;
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
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Withdrawal should have failed");
    } catch (error) {
      assert.include(error.message, "The goal amount has not been reached.");
    }
  });

  it("Contributes from a second account to reach the goal", async () => {
    [contributorPDA2] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("contribute"),
        campaignPDA.toBuffer(),
        contributor2.publicKey.toBuffer(),
      ],
      program.programId
    );

    // balance
    const contributorBalance1 = await program.provider.connection.getBalance(
      contributor2.publicKey
    );
    const campaignBalance1 = await program.provider.connection.getBalance(
      campaignPDA
    );

    const contributeAmount = LAMPORTS_PER_SOL * 2;

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
    assert.equal(campaign.totalContributed.toNumber(), LAMPORTS_PER_SOL * 3);
    const contributorAccount = await program.account.contributor.fetch(
      contributorPDA2
    );
    assert.equal(contributorAccount.amount.toNumber(), contributeAmount);

    const contributorBalance2 = await program.provider.connection.getBalance(
      contributor2.publicKey
    );
    const campaignBalance2 = await program.provider.connection.getBalance(
      campaignPDA
    );
    assert.isBelow(contributorBalance2, contributorBalance1);
    assert.isAbove(campaignBalance2, campaignBalance1);
  });

  it("Contributes from a third account but fails due to goal already being met", async () => {
    [contributorPDA3] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("contribute"),
        campaignPDA.toBuffer(),
        contributor3.publicKey.toBuffer(),
      ],
      program.programId
    );

    // balance
    const contributorBalance1 = await program.provider.connection.getBalance(
      contributor3.publicKey
    );
    const campaignBalance1 = await program.provider.connection.getBalance(
      campaignPDA
    );

    const contributeAmount = LAMPORTS_PER_SOL * 4;

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
    assert.equal(campaign.totalContributed.toNumber(), LAMPORTS_PER_SOL * 7);
    const contributorAccount = await program.account.contributor.fetch(
      contributorPDA3
    );
    assert.equal(contributorAccount.amount.toNumber(), contributeAmount);

    const contributorBalance2 = await program.provider.connection.getBalance(
      contributor3.publicKey
    );
    const campaignBalance2 = await program.provider.connection.getBalance(
      campaignPDA
    );
    assert.isBelow(contributorBalance2, contributorBalance1);
    assert.isAbove(campaignBalance2, campaignBalance1);
  });

  it("Withdraws from from the first account", async () => {
    const currentFunds = await program.provider.connection.getBalance(
      contributor.publicKey
    );

    const campaignBalance1 = await program.provider.connection.getBalance(
      campaignPDA
    );

    await program.methods
      .withdrawContributer()
      .accounts({
        campaign: campaignPDA,
        contributor: contributorPDA,
        signer: contributor.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc()
      .catch((error) => {
        console.log("error", error);
      });

    const campaign = await program.account.campaign.fetch(campaignPDA);
    assert.equal(campaign.totalContributed.toNumber(), LAMPORTS_PER_SOL * 6);
    const contributorAccount = await program.account.contributor.fetch(
      contributorPDA
    );
    assert.equal(contributorAccount.amount.toNumber(), 0);

    // signer funds should be higher than before
    const newFunds = await program.provider.connection.getBalance(
      contributor.publicKey
    );
    const campaignBalance2 = await program.provider.connection.getBalance(
      campaignPDA
    );
    assert.isAbove(newFunds, currentFunds);
    assert.isBelow(campaignBalance2, campaignBalance1);
  });

  it("Withdraws from from the first account again and errors", async () => {
    try {
      await program.methods
        .withdrawContributer()
        .accounts({
          campaign: campaignPDA,
          contributor: contributorPDA,
          signer: contributor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Withdrawal should have failed");
    } catch (error) {
      assert.include(error.message, "Cannot withdraw more than once");
    }
  });

  it("Withdraws from the campaign but is not successful due to the time not being up", async () => {
    try {
      await program.methods
        .withdrawCreator()
        .accounts({
          campaign: campaignPDA,
          signer: campaignCreator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Withdrawal should have failed");
    } catch (error) {
      assert.include(error.message, "The campaign has not ended yet.");
    }
  });

  it("Withdraws from the campaign", async () => {
    // wait for the campaign to end
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const campaignBalance1 = await program.provider.connection.getBalance(
      campaignPDA
    );

    await program.methods
      .withdrawCreator()
      .accounts({
        campaign: campaignPDA,
        signer: campaignCreator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const campaignBalance2 = await program.provider.connection.getBalance(
      campaignPDA
    );
    const creatorBalance2 = await program.provider.connection.getBalance(
      campaignCreator.publicKey
    );
    assert.isAbove(creatorBalance2, 6 * LAMPORTS_PER_SOL);
    assert.isBelow(campaignBalance2, campaignBalance1);
  });

  it("Withdraws from from the second account (errors)", async () => {
    try {
      await program.methods
        .withdrawContributer()
        .accounts({
          campaign: campaignPDA,
          contributor: contributorPDA2,
          signer: contributor2.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    } catch (error) {
      assert.include(error.message, "Refund conditions are not met.");
    }
  });

  it("Contributes to one campaign and tries to withdraw from another", async () => {
    const creator1 = anchor.web3.Keypair.generate();
    const creator2 = anchor.web3.Keypair.generate();
    const contributor = anchor.web3.Keypair.generate();
    const contributor2 = anchor.web3.Keypair.generate();

    await airdrop(program.provider, creator1.publicKey, LAMPORTS_PER_SOL * 5);
    await airdrop(program.provider, creator2.publicKey, LAMPORTS_PER_SOL * 5);
    await airdrop(
      program.provider,
      contributor.publicKey,
      LAMPORTS_PER_SOL * 5
    );
    await airdrop(
      program.provider,
      contributor2.publicKey,
      LAMPORTS_PER_SOL * 5
    );

    // functions

    const endDate = Math.round(Date.now() / 1000) + 10;

    const [campaignPDA1] = PublicKey.findProgramAddressSync(
      [Buffer.from("create_campaign"), creator1.publicKey.toBuffer()],
      program.programId
    );
    await program.methods
      .createCampaign(new anchor.BN(goalAmount), new anchor.BN(endDate))
      .accounts({
        campaign: campaignPDA1,
        signer: creator1.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator1])
      .rpc();

    let campaign = await program.account.campaign.fetch(campaignPDA1);
    assert.equal(campaign.goalAmount.toNumber(), goalAmount);

    const [campaignPDA2] = PublicKey.findProgramAddressSync(
      [Buffer.from("create_campaign"), creator2.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .createCampaign(new anchor.BN(goalAmount), new anchor.BN(endDate))
      .accounts({
        campaign: campaignPDA2,
        signer: creator2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator2])
      .rpc();

    campaign = await program.account.campaign.fetch(campaignPDA2);
    assert.equal(campaign.goalAmount.toNumber(), goalAmount);

    // contribute to campaign 1
    let contributeAmount = LAMPORTS_PER_SOL * 1;

    const [contributorPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("contribute"),
        campaignPDA1.toBuffer(),
        contributor.publicKey.toBuffer(),
      ],
      program.programId
    );
    await program.methods
      .contribute(new anchor.BN(contributeAmount))
      .accounts({
        campaign: campaignPDA1,
        contributor: contributorPDA,
        signer: contributor.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([contributor])
      .rpc()
      .catch((error) => {
        console.log("error", error);
      });

    let campaignBalance = await program.provider.connection.getBalance(
      campaignPDA1
    );
    assert.isAbove(campaignBalance, 0);

    contributeAmount = LAMPORTS_PER_SOL * 2;

    // contribute to campaign 2
    const [contributorPDA2] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("contribute"),
        campaignPDA2.toBuffer(),
        contributor2.publicKey.toBuffer(),
      ],
      program.programId
    );
    await program.methods
      .contribute(new anchor.BN(contributeAmount))
      .accounts({
        campaign: campaignPDA2,
        contributor: contributorPDA2,
        signer: contributor2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([contributor2])
      .rpc()
      .catch((error) => {
        console.log("error", error);
      });

    campaignBalance = await program.provider.connection.getBalance(
      campaignPDA1
    );
    assert.isAbove(campaignBalance, 0);

    // try to withdraw from campaign 2
    // check balance of contributor
    const contributorBalance1 = await program.provider.connection.getBalance(
      contributor.publicKey
    );
    try {
      await program.methods
        .withdrawContributer()
        .accounts({
          campaign: campaignPDA2,
          contributor: contributorPDA,
          signer: contributor.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Withdrawal should have failed");
    } catch (error) {
      const contributorBalance2 = await program.provider.connection.getBalance(
        contributor.publicKey
      );
      assert.equal(contributorBalance2, contributorBalance1);
      assert.include(error.message, "A seeds constraint was violated");
    }

    // withdraw from campaign 1
    await program.methods
      .withdrawContributer()
      .accounts({
        campaign: campaignPDA1,
        contributor: contributorPDA,
        signer: contributor.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc()
      .catch((error) => {
        console.log("error 2", error);
      });

    const contributorBalance2 = await program.provider.connection.getBalance(
      contributor.publicKey
    );
    assert.isAbove(contributorBalance2, contributorBalance1);
  });
});
