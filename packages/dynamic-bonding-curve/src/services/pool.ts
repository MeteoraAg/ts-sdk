import {
    Commitment,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
    type Connection,
    type Transaction,
} from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './DbcProgram'
import {
    InitializePoolBaseParam,
    PrepareSwapParams,
    TokenType,
    type CreatePoolParam,
    type CreateVirtualPoolMetadataParam,
    type SwapParam,
    type SwapQuoteParam,
} from '../types'
import {
    deriveMetadata,
    derivePool,
    deriveTokenVaultAddress,
    deriveVirtualPoolMetadata,
    getTokenProgram,
    unwrapSOLInstruction,
    wrapSOLInstruction,
} from '../helpers'
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { METAPLEX_PROGRAM_ID } from '../constants'
import { swapQuote } from '../math/swapQuote'

export class PoolService extends DynamicBondingCurveProgram {
    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
    }

    private async initializeSplPool(
        initializeSplPoolParams: InitializePoolBaseParam
    ): Promise<Transaction> {
        const {
            name,
            symbol,
            uri,
            pool,
            config,
            payer,
            poolCreator,
            mintMetadata,
            baseMint,
            baseVault,
            quoteVault,
            quoteMint,
        } = initializeSplPoolParams
        return this.program.methods
            .initializeVirtualPoolWithSplToken({
                name,
                symbol,
                uri,
            })
            .accountsPartial({
                pool,
                config,
                payer,
                creator: poolCreator,
                mintMetadata,
                baseMint,
                poolAuthority: this.poolAuthority,
                baseVault,
                quoteVault,
                quoteMint,
                tokenQuoteProgram: TOKEN_PROGRAM_ID,
                metadataProgram: METAPLEX_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .transaction()
    }

    private async initializeToken2022Pool(
        initializeToken2022PoolParams: InitializePoolBaseParam
    ): Promise<Transaction> {
        const {
            name,
            symbol,
            uri,
            pool,
            config,
            payer,
            poolCreator,
            baseMint,
            baseVault,
            quoteVault,
            quoteMint,
        } = initializeToken2022PoolParams
        return this.program.methods
            .initializeVirtualPoolWithToken2022({
                name,
                symbol,
                uri,
            })
            .accountsPartial({
                pool,
                config,
                payer,
                creator: poolCreator,
                baseMint,
                poolAuthority: this.poolAuthority,
                baseVault,
                quoteVault,
                quoteMint,
                tokenQuoteProgram: TOKEN_PROGRAM_ID,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .transaction()
    }

    /**
     * Prepare swap parameters
     * @param swapBaseForQuote - Whether to swap base for quote
     * @param virtualPoolState - The virtual pool state
     * @param poolConfigState - The pool config state
     * @returns The prepare swap parameters
     */
    private prepareSwapParams(
        swapBaseForQuote: boolean,
        virtualPoolState: {
            baseMint: PublicKey
            poolType: TokenType
        },
        poolConfigState: {
            quoteMint: PublicKey
            quoteTokenFlag: TokenType
        }
    ): PrepareSwapParams {
        if (swapBaseForQuote) {
            return {
                inputMint: new PublicKey(virtualPoolState.baseMint),
                outputMint: new PublicKey(poolConfigState.quoteMint),
                inputTokenProgram: getTokenProgram(virtualPoolState.poolType),
                outputTokenProgram: getTokenProgram(
                    poolConfigState.quoteTokenFlag
                ),
            }
        } else {
            return {
                inputMint: new PublicKey(poolConfigState.quoteMint),
                outputMint: new PublicKey(virtualPoolState.baseMint),
                inputTokenProgram: getTokenProgram(
                    poolConfigState.quoteTokenFlag
                ),
                outputTokenProgram: getTokenProgram(virtualPoolState.poolType),
            }
        }
    }

    /**
     * Create a new pool
     * @param createPoolParam - The parameters for the pool
     * @returns A new pool
     */
    async createPool(createPoolParam: CreatePoolParam): Promise<Transaction> {
        const { baseMint, config, name, symbol, uri, payer, poolCreator } =
            createPoolParam

        const poolConfigState = await this.fetchPoolConfigState(config)

        const { quoteMint, tokenType } = poolConfigState

        const pool = derivePool(
            quoteMint,
            baseMint,
            config,
            this.program.programId
        )
        const baseVault = deriveTokenVaultAddress(
            pool,
            baseMint,
            this.program.programId
        )
        const quoteVault = deriveTokenVaultAddress(
            pool,
            quoteMint,
            this.program.programId
        )

        const baseParams: InitializePoolBaseParam = {
            name,
            symbol,
            uri,
            pool,
            config,
            payer,
            poolCreator,
            baseMint,
            baseVault,
            quoteVault,
            quoteMint,
        }

        if (tokenType === TokenType.SPL) {
            const mintMetadata = deriveMetadata(baseMint)
            return this.initializeSplPool({ ...baseParams, mintMetadata })
        } else {
            return this.initializeToken2022Pool(baseParams)
        }
    }

    /**
     * Create virtual pool metadata
     * @param createVirtualPoolMetadataParam - The parameters for the virtual pool metadata
     * @returns A create virtual pool metadata transaction
     */
    async createPoolMetadata(
        createVirtualPoolMetadataParam: CreateVirtualPoolMetadataParam
    ): Promise<Transaction> {
        const virtualPoolMetadata = deriveVirtualPoolMetadata(
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
     * Swap between base and quote
     * @param pool - The pool address
     * @param swapParam - The parameters for the swap
     * @returns A swap transaction
     */
    async swap(pool: PublicKey, swapParam: SwapParam): Promise<Transaction> {
        const virtualPoolState = await this.fetchVirtualPoolState(pool)

        if (!virtualPoolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.fetchPoolConfigState(
            virtualPoolState.config
        )

        const { amountIn, minimumAmountOut, swapBaseForQuote, owner } =
            swapParam

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(
                swapBaseForQuote,
                virtualPoolState,
                poolConfigState
            )

        // Add preInstructions for ATA creation and SOL wrapping
        const {
            ataTokenA: inputTokenAccount,
            ataTokenB: outputTokenAccount,
            instructions: preInstructions,
        } = await this.prepareTokenAccounts(
            owner,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram
        )

        // Add SOL wrapping instructions if needed
        if (inputMint.equals(NATIVE_MINT)) {
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
        if (
            [inputMint.toBase58(), outputMint.toBase58()].includes(
                NATIVE_MINT.toBase58()
            )
        ) {
            const unwrapIx = unwrapSOLInstruction(owner)

            unwrapIx && postInstructions.push(unwrapIx)
        }

        return this.program.methods
            .swap({
                amountIn,
                minimumAmountOut,
            })
            .accountsPartial({
                baseMint: virtualPoolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                pool: pool,
                baseVault: virtualPoolState.baseVault,
                quoteVault: virtualPoolState.quoteVault,
                config: virtualPoolState.config,
                poolAuthority: this.poolAuthority,
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
            })
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
