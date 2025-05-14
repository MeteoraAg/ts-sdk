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
    ClaimWithQuoteMintNotSolParam,
    ClaimWithQuoteMintSolParam,
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

    private async claimWithQuoteMintSol(
        claimWithQuoteMintSolParam: ClaimWithQuoteMintSolParam
    ): Promise<{
        accounts: {
            poolAuthority: PublicKey
            pool: PublicKey
            tokenAAccount: PublicKey
            tokenBAccount: PublicKey
            baseVault: PublicKey
            quoteVault: PublicKey
            baseMint: PublicKey
            quoteMint: PublicKey
            creator: PublicKey
            tokenBaseProgram: PublicKey
            tokenQuoteProgram: PublicKey
        }
        preInstructions: TransactionInstruction[]
        postInstructions: TransactionInstruction[]
    }> {
        const {
            creator,
            payer,
            feeReceiver,
            tempWSolAcc,
            pool,
            poolState,
            poolConfigState,
            tokenBaseProgram,
            tokenQuoteProgram,
        } = claimWithQuoteMintSolParam

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const tokenBaseAccount = findAssociatedTokenAddress(
            feeReceiver,
            poolState.baseMint,
            tokenBaseProgram
        )

        const tokenQuoteAccount = findAssociatedTokenAddress(
            tempWSolAcc,
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
                tempWSolAcc,
                poolConfigState.quoteMint
            )
        createTokenQuoteAccountIx &&
            preInstructions.push(createTokenQuoteAccountIx)

        const unwrapSolIx = unwrapSOLInstruction(tempWSolAcc, feeReceiver)
        unwrapSolIx && postInstructions.push(unwrapSolIx)

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

        return { accounts, preInstructions, postInstructions }
    }

    private async claimWithQuoteMintNotSol(
        claimWithQuoteMintNotSolParam: ClaimWithQuoteMintNotSolParam
    ): Promise<{
        accounts: {
            poolAuthority: PublicKey
            pool: PublicKey
            tokenAAccount: PublicKey
            tokenBAccount: PublicKey
            baseVault: PublicKey
            quoteVault: PublicKey
            baseMint: PublicKey
            quoteMint: PublicKey
            creator: PublicKey
            tokenBaseProgram: PublicKey
            tokenQuoteProgram: PublicKey
        }
        preInstructions: TransactionInstruction[]
    }> {
        const {
            creator,
            payer,
            feeReceiver,
            pool,
            poolState,
            poolConfigState,
            tokenBaseProgram,
            tokenQuoteProgram,
        } = claimWithQuoteMintNotSolParam

        const {
            ataTokenA: tokenBaseAccount,
            ataTokenB: tokenQuoteAccount,
            instructions: preInstructions,
        } = await this.prepareTokenAccounts(
            feeReceiver,
            payer,
            poolConfigState.quoteMint,
            poolState.baseMint,
            tokenQuoteProgram,
            tokenBaseProgram
        )

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

        return { accounts, preInstructions }
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

        if (isSOLQuoteMint) {
            const result = await this.claimWithQuoteMintSol({
                creator,
                payer,
                feeReceiver: receiver,
                tempWSolAcc,
                pool,
                poolState,
                poolConfigState,
                tokenBaseProgram,
                tokenQuoteProgram,
            })
            return this.program.methods
                .claimCreatorTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(result.accounts)
                .preInstructions(result.preInstructions)
                .postInstructions(result.postInstructions)
                .transaction()
        } else {
            const result = await this.claimWithQuoteMintNotSol({
                creator,
                payer,
                feeReceiver: receiver,
                pool,
                poolState,
                poolConfigState,
                tokenBaseProgram,
                tokenQuoteProgram,
            })
            return this.program.methods
                .claimCreatorTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(result.accounts)
                .preInstructions(result.preInstructions)
                .postInstructions([])
                .transaction()
        }
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
