import {
    PublicKey,
    SystemProgram,
    TransactionInstruction,
    type Connection,
    type Transaction,
} from '@solana/web3.js'
import type { DynamicBondingCurveClient } from '../client'
import {
    CreatePoolBuyParam,
    TokenType,
    type CreatePoolParam,
    type SwapParam,
    type SwapQuoteParam,
} from '../types'
import {
    deriveMetadata,
    derivePool,
    derivePoolAuthority,
    deriveTokenVaultAddress,
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
    getBuyInstructionsPreLaunch,
    isNativeSol,
    unwrapSOLInstruction,
    wrapSOLInstruction,
} from '../utils'
import { swapQuote } from '../math/swapQuote'
import { validateBalance, validateBaseTokenType } from '../checks'
import { BN } from 'bn.js'

export class PoolService {
    private connection: Connection

    constructor(private programClient: DynamicBondingCurveClient) {
        this.connection = this.programClient.getProgram().provider.connection
    }

    /**
     * Create a new pool
     * @param createPoolParam - The parameters for the pool
     * @param buyParam - The parameters for a optional buy
     * @returns A new pool
     */
    async createPool(createPoolParam: CreatePoolParam, buyParam?: CreatePoolBuyParam): Promise<Transaction> {
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

        const buyInstructions: TransactionInstruction[] = [];

        if (buyParam) {
            buyInstructions.push(
                ...(await getBuyInstructionsPreLaunch(
                    program,
                    this.connection,
                    {
                        pool,
                        owner: payer,
                        amountIn: buyParam.buyAmount,
                        // Workaround for the fact that the pool is not yet created and there can not be any slippage
                        // Seems like testing with 0 breaks something? Need to investigate
                        minimumAmountOut: new BN(1),
                        swapBaseForQuote: false,
                        referralTokenAccount: buyParam.referralTokenAccount,
                    },
                    config,
                    baseMint,
                    quoteMint,
                    baseTokenType,
                    quoteTokenType,
                    baseVault,
                    quoteVault,
                ))
            )
        }

        if (baseTokenType === TokenType.SPL) {
            const accounts = {
                config,
                baseMint,
                quoteMint,
                pool,
                payer,
                creator: poolCreator,
                poolAuthority,
                baseVault,
                quoteVault,
                mintMetadata: baseMetadata,
                metadataProgram: METAPLEX_PROGRAM_ID,
                tokenQuoteProgram:
                    quoteTokenType === TokenType.SPL
                        ? TOKEN_PROGRAM_ID
                        : TOKEN_2022_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
            }
            return program.methods
                .initializeVirtualPoolWithSplToken({
                    name,
                    symbol,
                    uri,
                })
                .accountsPartial(accounts)
                .postInstructions(buyInstructions)
                .transaction()
        }

        if (baseTokenType === TokenType.Token2022) {
            const accounts = {
                config,
                baseMint,
                quoteMint,
                pool,
                payer,
                creator: poolCreator,
                poolAuthority,
                baseVault,
                quoteVault,
                tokenQuoteProgram: TOKEN_PROGRAM_ID,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            }

            return program.methods
                .initializeVirtualPoolWithToken2022({
                    name,
                    symbol,
                    uri,
                })
                .accountsPartial(accounts)
                .postInstructions(buyInstructions)
                .transaction()
        }

        throw new Error('Invalid base token type')
    }

    /**
     * Swap between base and quote
     * @param pool - The pool address
     * @param swapParam - The parameters for the swap
     * @returns A swap transaction
     */
    async swap(swapParam: SwapParam): Promise<Transaction> {
        const program = this.programClient.getProgram()
        const poolAuthority = derivePoolAuthority(program.programId)

        const virtualPoolState = await this.programClient.getPool(
            swapParam.pool
        )

        if (!virtualPoolState) {
            throw new Error(`Pool not found: ${swapParam.pool.toString()}`)
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

        const accounts = {
            poolAuthority,
            config: virtualPoolState.config,
            pool: swapParam.pool,
            inputTokenAccount,
            outputTokenAccount,
            baseVault: virtualPoolState.baseVault,
            quoteVault: virtualPoolState.quoteVault,
            baseMint: virtualPoolState.baseMint,
            quoteMint: poolConfigState.quoteMint,
            payer: owner,
            tokenBaseProgram: swapBaseForQuote
                ? inputTokenProgram
                : outputTokenProgram,
            tokenQuoteProgram: swapBaseForQuote
                ? outputTokenProgram
                : inputTokenProgram,
            referralTokenAccount: swapParam.referralTokenAccount,
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
            .accountsPartial(accounts)
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
