use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;

declare_id!("Dd8znVFe2PieDStP8tV99c7P3jhKeNnf8EfFkEXjWtan");

#[program]
pub mod solfundme {
    use super::*;

    pub fn create_campaign(ctx: Context<CreateCampaign>, goal_amount: u64, end_date: i64) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        campaign.authority = ctx.accounts.signer.key();
        campaign.end_date = end_date;
        campaign.goal_amount = goal_amount;
        campaign.total_contributed = 0;
        campaign.bump = ctx.bumps.campaign;
        campaign.withdrawn = false;
        Ok(())
    }

    pub fn contribute(ctx: Context<Contribute>, amount: u64) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let contributor = &mut ctx.accounts.contributor;
        let signer = &ctx.accounts.signer;

        require!(
            amount <= **ctx.accounts.signer.to_account_info().lamports.borrow() && amount > 0,
            SolFundMeError::InvalidAmount
        );
        require!(
            campaign.end_date > Clock::get().unwrap().unix_timestamp,
            SolFundMeError::CampaignEnded
        );


        let ix = system_instruction::transfer(
            &signer.key(),
            &campaign.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                campaign.to_account_info(),
                signer.to_account_info(),
            ],
        )?;

        contributor.owner = ctx.accounts.signer.key();
        contributor.amount += amount;
        contributor.withdrawn = false;
        contributor.bump = ctx.bumps.contributor;

        campaign.total_contributed += amount;
        Ok(())
    }

    pub fn withdraw_contributer(ctx: Context<WithdrawContributer>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let contributor = &mut ctx.accounts.contributor;
        let signer = &ctx.accounts.signer;

        require!(
            !contributor.withdrawn,
            SolFundMeError::AlreadyWithdrawn
        );

        // can only withdraw after campaign has ended if goal is not reached
        // otherwise can withdraw anytime
        require!(
            !(Clock::get().unwrap().unix_timestamp >= campaign.end_date && campaign.total_contributed >= campaign.goal_amount),
            SolFundMeError::RefundConditionsNotMet
        );

        let amount = contributor.amount;

        campaign.sub_lamports(amount)?;
        signer.add_lamports(amount)?;

        campaign.total_contributed -= amount;
        contributor.withdrawn = true;
        contributor.amount = 0;

        Ok(())
    }

    pub fn withdraw_creator(ctx: Context<WithdrawCreator>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let signer = &ctx.accounts.signer;

        require!(
            campaign.total_contributed >= campaign.goal_amount,
            SolFundMeError::GoalNotReached
        );
        require!(
            campaign.end_date <= Clock::get().unwrap().unix_timestamp,
            SolFundMeError::CampaignNotEnded
        );

        let amount = campaign.total_contributed;

        campaign.sub_lamports(amount)?;
        signer.add_lamports(amount)?;

        campaign.withdrawn = true;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateCampaign<'info> {
    #[account(
        init,
        payer = signer,
        space = 8 + 32 + 8 + 8 + 8 + 1 + 1,
        seeds = [b"create_campaign", signer.key.as_ref()],
        bump,
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Contribute<'info> {
    #[account(mut, 
        seeds = [b"create_campaign", campaign.authority.as_ref()],
        bump = campaign.bump,
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(init_if_needed,
        space = 8 + 32 + 8 + 1 + 1,
        payer = signer,
        seeds = [b"contribute", signer.key.as_ref()],
        bump,
    )]
    pub contributor: Account<'info, Contributor>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawContributer<'info> {
    #[account(mut,
        seeds = [b"create_campaign", campaign.authority.as_ref()],
        bump = campaign.bump,
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(mut,
        constraint = contributor.owner.as_ref() == signer.key.as_ref(),
        seeds = [b"contribute", signer.key.as_ref()],
        bump = contributor.bump,
    )]
    pub contributor: Account<'info, Contributor>,
    #[account(mut)]
    /// CHECK: sending money to this account
    pub signer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawCreator<'info> {
    #[account(mut,
        seeds = [b"create_campaign", campaign.authority.as_ref()],
        constraint = campaign.authority.as_ref() == signer.key.as_ref() && !campaign.withdrawn,
        bump = campaign.bump,
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: receiving money from this account
    #[account(mut)]
    pub signer: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Campaign {
    pub authority: Pubkey,
    pub end_date: i64,
    pub goal_amount: u64,
    pub total_contributed: u64,
    pub withdrawn: bool,
    pub bump: u8,
}

#[account]
pub struct Contributor {
    pub owner: Pubkey,
    pub amount: u64,
    pub withdrawn: bool,
    pub bump: u8,
}

#[error_code]
pub enum SolFundMeError {
    #[msg("The amount must be greater than zero.")]
    InvalidAmount,
    #[msg("The campaign has already ended.")]
    CampaignEnded,
    #[msg("The campaign has not ended yet.")]
    CampaignNotEnded,
    #[msg("The goal amount has not been reached.")]
    GoalNotReached,
    #[msg("Refund conditions are not met.")]
    RefundConditionsNotMet,
    #[msg("Cannot withdraw more than once.")]
    AlreadyWithdrawn,
}
