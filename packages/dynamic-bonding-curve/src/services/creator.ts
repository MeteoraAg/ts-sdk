import {
    Commitment,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    type Connection,
} from '@solana/web3.js'
import {
    ClaimCreatorTradingFeeParam,
    CreateVirtualPoolMetadataParam,
    CreatorWithdrawSurplusParam,
} from '../types'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { DynamicBondingCurveProgram } from './program'
import {
    deriveDbcPoolMetadata,
    findAssociatedTokenAddress,
    getTokenProgram,
    isNativeSol,
    unwrapSOLInstruction,
} from '../helpers'
import { StateService } from './state'

export class CreatorService extends DynamicBondingCurveProgram {
    private state: StateService

    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
        this.state = new StateService(connection, commitment)
    }

    /**
     * Create virtual pool metadata
     * @param createVirtualPoolMetadataParam - The parameters for the virtual pool metadata
     * @returns A create virtual pool metadata transaction
     */
    async createPoolMetadata(
        createVirtualPoolMetadataParam: CreateVirtualPoolMetadataParam
    ): Promise<Transaction> {
        const virtualPoolMetadata = deriveDbcPoolMetadata(
            createVirtualPoolMetadataParam.virtualPool
        )
        return this.program.methods
            .createVirtualPoolMetadata({
                padding: new Array(96).fill(0),
                name: createVirtualPoolMetadataParam.name,
                website: createVirtualPoolMetadataParam.website,
                logo: createVirtualPoolMetadataParam.logo,
            })
            .accountsPartial({
                virtualPool: createVirtualPoolMetadataParam.virtualPool,
                virtualPoolMetadata,
                creator: createVirtualPoolMetadataParam.creator,
                payer: createVirtualPoolMetadataParam.payer,
                systemProgram: SystemProgram.programId,
            })
            .transaction()
    }

    /**
     * Claim creator trading fee
     * @param claimCreatorTradingFeeParam - The parameters for the claim creator trading fee
     * @returns A claim creator trading fee transaction
     */
    async claimCreatorTradingFee(
        claimCreatorTradingFeeParam: ClaimCreatorTradingFeeParam
    ): Promise<Transaction> {
        const {
            creator,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
            payer,
            tempWSolAcc,
        } = claimCreatorTradingFeeParam

        const poolState = await this.state.getPool(pool)

        if (!poolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        if (!poolConfigState) {
            throw new Error(`Pool config not found: ${pool.toString()}`)
        }

        const tokenBaseProgram = getTokenProgram(poolConfigState.tokenType)
        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )

        const isSOLQuoteMint = isNativeSol(poolConfigState.quoteMint)

        let tokenBaseAccount: PublicKey
        let tokenQuoteAccount: PublicKey

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const feeReceiver = receiver ? receiver : creator

        const tempWSol = receiver ? tempWSolAcc : creator

        if (feeReceiver == creator) {
            const tokenAccountsResult = await this.prepareTokenAccounts(
                feeReceiver,
                payer,
                poolState.baseMint,
                poolConfigState.quoteMint,
                tokenBaseProgram,
                tokenQuoteProgram
            )

            tokenBaseAccount = tokenAccountsResult.ataTokenA
            tokenQuoteAccount = tokenAccountsResult.ataTokenB
            preInstructions.push(...tokenAccountsResult.instructions)
        } else if (feeReceiver != creator) {
            tokenBaseAccount = findAssociatedTokenAddress(
                feeReceiver,
                poolState.baseMint,
                tokenBaseProgram
            )
            tokenQuoteAccount = findAssociatedTokenAddress(
                tempWSol,
                poolConfigState.quoteMint,
                tokenQuoteProgram
            )

            const createTokenBaseAccountIx =
                createAssociatedTokenAccountIdempotentInstruction(
                    payer,
                    tokenBaseAccount,
                    feeReceiver,
                    poolState.baseMint
                )
            createTokenBaseAccountIx &&
                preInstructions.push(createTokenBaseAccountIx)

            const createTokenQuoteAccountIx =
                createAssociatedTokenAccountIdempotentInstruction(
                    payer,
                    tokenQuoteAccount,
                    tempWSol,
                    poolConfigState.quoteMint
                )
            createTokenQuoteAccountIx &&
                preInstructions.push(createTokenQuoteAccountIx)

            if (isSOLQuoteMint) {
                const unwrapSolIx = unwrapSOLInstruction(tempWSol, receiver)
                unwrapSolIx && postInstructions.push(unwrapSolIx)
            }
        }

        const accounts = {
            poolAuthority: this.poolAuthority,
            pool,
            tokenAAccount: tokenBaseAccount,
            tokenBAccount: tokenQuoteAccount,
            baseVault: poolState.baseVault,
            quoteVault: poolState.quoteVault,
            baseMint: poolState.baseMint,
            quoteMint: poolConfigState.quoteMint,
            creator,
            tokenBaseProgram,
            tokenQuoteProgram,
        }

        return this.program.methods
            .claimCreatorTradingFee(maxBaseAmount, maxQuoteAmount)
            .accountsPartial(accounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Withdraw creator surplus
     * @param creatorWithdrawSurplusParam - The parameters for the creator withdraw surplus
     * @returns A creator withdraw surplus transaction
     */
    async creatorWithdrawSurplus(
        creatorWithdrawSurplusParam: CreatorWithdrawSurplusParam
    ): Promise<Transaction> {
        const { creator, virtualPool } = creatorWithdrawSurplusParam

        const poolState = await this.state.getPool(virtualPool)

        if (!poolState) {
            throw new Error(`Pool not found: ${virtualPool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        if (!poolConfigState) {
            throw new Error(`Pool config not found: ${virtualPool.toString()}`)
        }

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const tokenQuoteAccount = findAssociatedTokenAddress(
            creator,
            poolConfigState.quoteMint,
            TOKEN_PROGRAM_ID
        )

        const createQuoteTokenAccountIx =
            createAssociatedTokenAccountIdempotentInstruction(
                creator,
                tokenQuoteAccount,
                creator,
                poolConfigState.quoteMint,
                TOKEN_PROGRAM_ID
            )

        if (createQuoteTokenAccountIx) {
            preInstructions.push(createQuoteTokenAccountIx)
        }

        const isSOLQuoteMint = isNativeSol(poolConfigState.quoteMint)

        if (isSOLQuoteMint) {
            const unwrapIx = unwrapSOLInstruction(creator, creator)
            if (unwrapIx) {
                postInstructions.push(unwrapIx)
            }
        }

        const accounts = {
            poolAuthority: this.poolAuthority,
            config: poolState.config,
            virtualPool,
            tokenQuoteAccount,
            quoteVault: poolState.quoteVault,
            quoteMint: poolConfigState.quoteMint,
            creator,
            tokenQuoteProgram: TOKEN_PROGRAM_ID,
        }

        return this.program.methods
            .creatorWithdrawSurplus()
            .accountsPartial(accounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }
}
