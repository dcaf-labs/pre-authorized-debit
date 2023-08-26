use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::state::{
    pre_authorization::{PreAuthorization, PreAuthorizationVariant},
    smart_delegate::SmartDelegate,
};

#[derive(Accounts)]
pub struct InitPreAuthorization<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub owner: Signer<'info>,

    // TODO: Throw custom error on failure
    #[account(has_one = owner)]
    pub token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            b"smart-delegate",
            token_account.key().as_ref(),
        ],
        bump = smart_delegate.bump,
        // TODO: Throw custom error on failure
        has_one = token_account,
    )]
    pub smart_delegate: Account<'info, SmartDelegate>,

    #[account(
        init,
        space = 8 + PreAuthorization::INIT_SPACE,
        seeds = [
            b"pre-authorization",
            smart_delegate.key().as_ref(),
            smart_delegate.pre_authorization_nonce.to_string().as_ref(),
        ],
        bump,
        payer = payer,
    )]
    pub pre_authorization: Account<'info, PreAuthorization>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitPreAuthorizationParams {
    pub variant: PreAuthorizationVariant,
    pub debit_authority: Pubkey,
    pub activation_unix_timestamp: u64,
}

pub fn handle_init_pre_authorization(
    ctx: Context<InitPreAuthorization>,
    params: InitPreAuthorizationParams,
) -> Result<()> {
    ctx.accounts.smart_delegate.pre_authorization_nonce += 1;

    ctx.accounts.pre_authorization.smart_delegate = ctx.accounts.smart_delegate.key();
    ctx.accounts.pre_authorization.amount_debited = 0;
    ctx.accounts.pre_authorization.variant = params.variant;
    ctx.accounts.pre_authorization.debit_authority = params.debit_authority;
    ctx.accounts.pre_authorization.activation_unix_timestamp = params.activation_unix_timestamp;
    ctx.accounts.pre_authorization.bump = *ctx
        .bumps
        .get("pre_authorization")
        .expect("pre_authorization PDA bump access failed");

    Ok(())
}