import {
    PublicKey,
    SystemProgram,
    TransactionInstruction,
    type Connection,
    type Transaction,
} from '@solana/web3.js'
import type { DynamicBondingCurveProgramClient } from '../client'
import {
    TokenType,
    type CreatePoolParam,
    type CreateVirtualPoolMetadataParam,
    type CreateVirtualPoolMetadataParameters,
    type InitializeVirtualPoolWithSplTokenAccounts,
    type InitializeVirtualPoolWithToken2022Accounts,
    type SwapAccounts,
    type SwapParam,
    type SwapQuoteParam,
} from '../types'
import {
    deriveEventAuthority,
    deriveMetadata,
    derivePool,
    derivePoolAuthority,
    deriveTokenVaultAddress,
    deriveVirtualPoolMetadata,
} from '../derive'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { METAPLEX_PROGRAM_ID } from '../constants'
import { prepareSwapParams } from '../common'
import {
    findAssociatedTokenAddress,
    isNativeSol,
    unwrapSOLInstruction,
    wrapSOLInstruction,
} from '../utils'
import { swapQuote } from '../math/swapQuote'
import { validateBalance, validateBaseTokenType } from '../checks'

export class PoolService {
    private connection: Connection

    constructor(private programClient: DynamicBondingCurveProgramClient) {
        this.connection = this.programClient.getProgram().provider.connection
    }

    /**
     * Create a new pool
     * @param createPoolParam - The parameters for the pool
     * @returns A new pool
     */
    async createPool(createPoolParam: CreatePoolParam): Promise<Transaction> {
        const program = this.programClient.getProgram()
        const {
            quoteMint,
            baseMint,
            config,
            baseTokenType,
            quoteTokenType,
            name,
            symbol,
            uri,
            payer,
            poolCreator,
        } = createPoolParam

        const poolConfigState = await this.programClient.getPoolConfig(config)

        // error checks
        validateBaseTokenType(baseTokenType, poolConfigState)

        const eventAuthority = deriveEventAuthority()
        const poolAuthority = derivePoolAuthority(program.programId)
        const pool = derivePool(quoteMint, baseMint, config, program.programId)
        const baseVault = deriveTokenVaultAddress(
            pool,
            baseMint,
            program.programId
        )
        const quoteVault = deriveTokenVaultAddress(
            pool,
            quoteMint,
            program.programId
        )
        const baseMetadata = deriveMetadata(baseMint)

        if (baseTokenType === TokenType.SPL) {
            const accounts: InitializeVirtualPoolWithSplTokenAccounts = {
                pool,
                config,
                payer,
                creator: poolCreator,
                mintMetadata: baseMetadata,
                program: program.programId,
                tokenQuoteProgram:
                    quoteTokenType === TokenType.SPL
                        ? TOKEN_PROGRAM_ID
                        : TOKEN_2022_PROGRAM_ID,
                baseMint,
                poolAuthority,
                baseVault,
                quoteVault,
                quoteMint,
                eventAuthority,
                metadataProgram: METAPLEX_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
            }
            return program.methods
                .initializeVirtualPoolWithSplToken({
                    name,
                    symbol,
                    uri,
                })
                .accounts(accounts)
                .transaction()
        }

        if (baseTokenType === TokenType.Token2022) {
            const accounts: InitializeVirtualPoolWithToken2022Accounts = {
                pool,
                config,
                payer,
                creator: poolCreator,
                program: program.programId,
                baseMint,
                poolAuthority,
                baseVault,
                quoteVault,
                quoteMint,
                eventAuthority,
                tokenQuoteProgram: TOKEN_PROGRAM_ID,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            }
            return program.methods
                .initializeVirtualPoolWithToken2022({
                    name,
                    symbol,
                    uri,
                })
                .accounts(accounts)
                .transaction()
        }

        throw new Error('Invalid base token type')
    }

    /**
     * Create virtual pool metadata
     * @param createVirtualPoolMetadataParam - The parameters for the virtual pool metadata
     * @returns A create virtual pool metadata transaction
     */
    async createPoolMetadata(
        createVirtualPoolMetadataParam: CreateVirtualPoolMetadataParam
    ): Promise<Transaction> {
        const program = this.programClient.getProgram()
        const eventAuthority = deriveEventAuthority()
        const virtualPoolMetadata = deriveVirtualPoolMetadata(
            createVirtualPoolMetadataParam.virtualPool
        )

        const virtualPoolMetadataParam: CreateVirtualPoolMetadataParameters = {
            padding: new Array(96).fill(0),
            name: createVirtualPoolMetadataParam.name,
            website: createVirtualPoolMetadataParam.website,
            logo: createVirtualPoolMetadataParam.logo,
        }

        const accounts = {
            virtualPool: createVirtualPoolMetadataParam.virtualPool,
            virtualPoolMetadata,
            creator: createVirtualPoolMetadataParam.creator,
            payer: createVirtualPoolMetadataParam.payer,
            systemProgram: SystemProgram.programId,
            eventAuthority,
            program: program.programId,
        }

        return program.methods
            .createVirtualPoolMetadata(virtualPoolMetadataParam)
            .accounts(accounts)
            .transaction()
    }

    /**
     * Swap between base and quote
     * @param pool - The pool address
     * @param swapParam - The parameters for the swap
     * @returns A swap transaction
     */
    async swap(pool: PublicKey, swapParam: SwapParam): Promise<Transaction> {
        const program = this.programClient.getProgram()
        const eventAuthority = deriveEventAuthority()
        const poolAuthority = derivePoolAuthority(program.programId)

        const virtualPoolState = await this.programClient.getPool(pool)

        if (!virtualPoolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.programClient.getPoolConfig(
            virtualPoolState.config
        )

        const { amountIn, minimumAmountOut, swapBaseForQuote, owner } =
            swapParam

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            prepareSwapParams(
                swapBaseForQuote,
                virtualPoolState,
                poolConfigState
            )

        const isSOLInput = isNativeSol(inputMint)
        const isSOLOutput = isNativeSol(outputMint)

        const inputTokenAccount = findAssociatedTokenAddress(
            owner,
            inputMint,
            inputTokenProgram
        )

        const outputTokenAccount = findAssociatedTokenAddress(
            owner,
            outputMint,
            outputTokenProgram
        )

        await validateBalance(
            this.connection,
            owner,
            inputMint,
            amountIn,
            inputTokenAccount
        )

        const accounts: SwapAccounts = {
            baseMint: virtualPoolState.baseMint,
            quoteMint: poolConfigState.quoteMint,
            pool: pool,
            baseVault: virtualPoolState.baseVault,
            quoteVault: virtualPoolState.quoteVault,
            config: virtualPoolState.config,
            eventAuthority,
            poolAuthority,
            referralTokenAccount: null,
            inputTokenAccount,
            outputTokenAccount,
            payer: owner,
            tokenBaseProgram: swapBaseForQuote
                ? inputTokenProgram
                : outputTokenProgram,
            tokenQuoteProgram: swapBaseForQuote
                ? outputTokenProgram
                : inputTokenProgram,
            program: program.programId,
        }

        // Add preInstructions for ATA creation and SOL wrapping
        const preInstructions: TransactionInstruction[] = []

        // Check and create ATAs if needed
        const inputTokenAccountInfo =
            await this.connection.getAccountInfo(inputTokenAccount)
        if (!inputTokenAccountInfo) {
            preInstructions.push(
                createAssociatedTokenAccountIdempotentInstruction(
                    owner,
                    inputTokenAccount,
                    owner,
                    inputMint,
                    inputTokenProgram
                )
            )
        }

        const outputTokenAccountInfo =
            await this.connection.getAccountInfo(outputTokenAccount)
        if (!outputTokenAccountInfo) {
            preInstructions.push(
                createAssociatedTokenAccountIdempotentInstruction(
                    owner,
                    outputTokenAccount,
                    owner,
                    outputMint,
                    outputTokenProgram
                )
            )
        }

        // Add SOL wrapping instructions if needed
        if (isSOLInput) {
            preInstructions.push(
                ...wrapSOLInstruction(
                    owner,
                    inputTokenAccount,
                    BigInt(amountIn.toString())
                )
            )
        }

        // Add postInstructions for SOL unwrapping
        const postInstructions: TransactionInstruction[] = []
        if (isSOLInput || isSOLOutput) {
            const unwrapIx = unwrapSOLInstruction(owner)
            if (unwrapIx) {
                postInstructions.push(unwrapIx)
            }
        }

        return program.methods
            .swap({
                amountIn,
                minimumAmountOut,
            })
            .accounts(accounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Calculate the amount out for a swap (quote)
     * @param virtualPool - The virtual pool
     * @param config - The config
     * @param swapBaseForQuote - Whether to swap base for quote
     * @param amountIn - The amount in
     * @param hasReferral - Whether the referral is enabled
     * @param currentPoint - The current point
     * @returns The swap quote result
     */
    swapQuote(swapQuoteParam: SwapQuoteParam) {
        const {
            virtualPool,
            config,
            swapBaseForQuote,
            amountIn,
            hasReferral,
            currentPoint,
        } = swapQuoteParam

        return swapQuote(
            virtualPool,
            config,
            swapBaseForQuote,
            amountIn,
            hasReferral,
            currentPoint
        )
    }
}
