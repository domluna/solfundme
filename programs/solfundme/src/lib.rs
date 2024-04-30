use anchor_lang::prelude::*;

declare_id!("Dd8znVFe2PieDStP8tV99c7P3jhKeNnf8EfFkEXjWtan");

#[program]
pub mod solfundme {
    use super::*;

    pub fn create_campaign(ctx: Context<CreateCampaign>, args: CreateCampaignArgs) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        campaign.authority = *ctx.accounts.signer.key;
        campaign.end_date = args.end_date;
        campaign.goal_amount = args.goal_amount;
        campaign.total_contributed = 0;
        campaign.bump = ctx.bumps.campaign;
        Ok(())
    }

    pub fn contribute(ctx: Context<Contribute>, args: ContributeArgs) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let contributor = &mut ctx.accounts.contributor;

        require!(args.amount > 0, SolFundMeError::InvalidAmount);
        require!(
            campaign.end_date > Clock::get().unwrap().unix_timestamp,
            SolFundMeError::CampaignEnded
        );

        **contributor.to_account_info().try_borrow_mut_lamports()? -= args.amount;
        **campaign.to_account_info().try_borrow_mut_lamports()? += args.amount;

        contributor.amount += args.amount;
        contributor.withdrawn = false;
        contributor.bump = ctx.bumps.contributor;

        campaign.total_contributed += args.amount;
        Ok(())
    }

    pub fn withdraw_contributer(ctx: Context<WithdrawContributer>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let contributor = &mut ctx.accounts.contributor;

        let amount = contributor.amount;
        **campaign.to_account_info().try_borrow_mut_lamports()? -= amount;
        campaign.total_contributed -= amount;

        **ctx
            .accounts
            .signer
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        contributor.withdrawn = true;
        contributor.amount = 0;

        Ok(())
    }

    pub fn withdraw_creator(ctx: Context<WithdrawCreator>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;

        require!(
            campaign.end_date <= Clock::get().unwrap().unix_timestamp,
            SolFundMeError::CampaignNotEnded
        );
        require!(
            campaign.total_contributed >= campaign.goal_amount,
            SolFundMeError::GoalNotReached
        );

        **campaign.to_account_info().try_borrow_mut_lamports()? -= campaign.total_contributed;
        **ctx
            .accounts
            .signer
            .to_account_info()
            .try_borrow_mut_lamports()? += campaign.total_contributed;

        Ok(())
    }

    pub fn refund_contributer(ctx: Context<RefundContributer>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        let contributor = &mut ctx.accounts.contributor;

        require!(
            campaign.end_date <= Clock::get().unwrap().unix_timestamp,
            SolFundMeError::CampaignNotEnded
        );
        require!(
            campaign.total_contributed < campaign.goal_amount,
            SolFundMeError::RefundConditionsNotMet
        );
        
        // we don't need to decrease the total_contributed amount because the contributors are getting refunded. Further contributions are no longer allowed.
        let amount = contributor.amount;
        **campaign.to_account_info().try_borrow_mut_lamports()? -= amount;
        **contributor.to_account_info().try_borrow_mut_lamports()? += amount;

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct CreateCampaignArgs {
    pub goal_amount: u64,
    pub end_date: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct ContributeArgs {
    pub amount: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct RefundArgs {
    pub amount: u64,
}

#[derive(Accounts)]
pub struct CreateCampaign<'info> {
    #[account(
        init,
        payer = signer,
        space = 8 + 32 + 8 + 8 + 8 + 1,
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
        constraint = campaign.authority != *contributor.to_account_info().key,
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(init_if_needed,
        space = 8 + 32 + 8 + 1 + 1,
        constraint = contributor.owner == *signer.key,
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
        constraint = contributor.owner.as_ref() == signer.key.as_ref() && !contributor.withdrawn,
        seeds = [b"contribute", signer.key.as_ref()],
        bump = contributor.bump,
    )]
    pub contributor: Account<'info, Contributor>,
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawCreator<'info> {
    #[account(mut,
        seeds = [b"create_campaign", campaign.authority.as_ref()],
        constraint = campaign.authority.as_ref() == signer.key.as_ref(),
        bump = campaign.bump,
    )]
    pub campaign: Account<'info, Campaign>,
    pub signer: Signer<'info>,
}

// similar to WithdrawContributer except the signer is the creator of the campaign
#[derive(Accounts)]
pub struct RefundContributer<'info> {
    #[account(mut,
        constraint = campaign.authority.as_ref() == signer.key.as_ref(),
        seeds = [b"create_campaign", campaign.authority.as_ref()],
        bump = campaign.bump,
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(mut,
        constraint = !contributor.withdrawn,
        seeds = [b"contribute", signer.key.as_ref()],
        bump = contributor.bump,
    )]
    pub contributor: Account<'info, Contributor>,
    pub signer: Signer<'info>,
}

#[account]
pub struct Campaign {
    pub authority: Pubkey,
    pub end_date: i64,
    pub goal_amount: u64,
    pub total_contributed: u64,
    pub bump: u8,
}

#[account]
pub struct Contributor {
    pub owner: Pubkey,
    pub amount: u64,
    pub bump: u8,
    pub withdrawn: bool,
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
}
