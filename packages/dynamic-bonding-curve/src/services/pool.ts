import {
    Commitment,
    PublicKey,
    TransactionInstruction,
    type Connection,
    Transaction,
} from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    CreateConfigAndPoolParam,
    CreatePoolAndBuyParam,
    InitializePoolBaseParam,
    PrepareSwapParams,
    TokenType,
    type CreatePoolParam,
    type SwapParam,
    type SwapQuoteParam,
} from '../types'
import {
    deriveDbcPoolAddress,
    deriveMintMetadata,
    getTokenProgram,
    unwrapSOLInstruction,
    wrapSOLInstruction,
    deriveDbcTokenVaultAddress,
} from '../helpers'
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { METAPLEX_PROGRAM_ID } from '../constants'
import { swapQuote } from '../math/swapQuote'
import { StateService } from './state'
import {
    validateConfigParameters,
    validateSwapAmount,
} from '../helpers/validation'

export class PoolService extends DynamicBondingCurveProgram {
    private state: StateService

    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
        this.state = new StateService(connection, commitment)
    }

    /**
     * Private method to initialize a pool with SPL token
     * @param initializeSplPoolParams - The parameters for the initialize SPL pool
     * @returns A transaction that initializes the pool with SPL token
     */
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

    /**
     * Private method to initialize a pool with Token2022
     * @param initializeToken2022PoolParams - The parameters for the initialize Token2022 pool
     * @returns A transaction that initializes the pool with Token2022
     */
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
     * Private method to prepare swap parameters
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

        const poolConfigState = await this.state.getPoolConfig(config)

        const { quoteMint, tokenType } = poolConfigState

        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMint)

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
            const mintMetadata = deriveMintMetadata(baseMint)
            return this.initializeSplPool({ ...baseParams, mintMetadata })
        } else {
            return this.initializeToken2022Pool(baseParams)
        }
    }

    /**
     * Create a new config and pool
     * @param createConfigAndPoolParam - The parameters for the config and pool
     * @returns A new config and pool
     */
    async createConfigAndPool(
        createConfigAndPoolParam: CreateConfigAndPoolParam
    ): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            ...configParam
        } = createConfigAndPoolParam

        const { baseMint, name, symbol, uri, poolCreator } =
            createConfigAndPoolParam.createPoolParam

        // error checks
        validateConfigParameters({ ...configParam, leftoverReceiver })

        const configKey = new PublicKey(config)
        const quoteMintToken = new PublicKey(quoteMint)
        const payerAddress = new PublicKey(payer)

        const tx = new Transaction()

        // create config transaction
        const configTx = await this.program.methods
            .createConfig(configParam)
            .accountsPartial({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint,
                payer,
            })
            .transaction()
        tx.add(configTx)

        const pool = deriveDbcPoolAddress(quoteMintToken, baseMint, configKey)
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMintToken)

        const baseParams: InitializePoolBaseParam = {
            name,
            symbol,
            uri,
            pool,
            config: configKey,
            payer: payerAddress,
            poolCreator,
            baseMint,
            baseVault,
            quoteVault,
            quoteMint: quoteMintToken,
        }

        if (createConfigAndPoolParam.tokenType === TokenType.SPL) {
            const mintMetadata = deriveMintMetadata(baseMint)
            const poolTx = await this.initializeSplPool({
                ...baseParams,
                mintMetadata,
            })
            tx.add(poolTx)
        } else {
            const poolTx = await this.initializeToken2022Pool(baseParams)
            tx.add(poolTx)
        }

        return tx
    }

    /**
     * Create a new pool and buy tokens
     * @param createPoolBuyParam - The parameters for the pool and buy
     * @returns A transaction that creates the pool and buys tokens
     */
    async createPoolAndBuy(
        createPoolBuyParam: CreatePoolAndBuyParam
    ): Promise<Transaction> {
        const { baseMint, config, name, symbol, uri, payer, poolCreator } =
            createPoolBuyParam.createPoolParam

        const { buyAmount, minimumAmountOut, referralTokenAccount } =
            createPoolBuyParam

        const poolConfigState = await this.state.getPoolConfig(config)

        const { quoteMint, tokenType } = poolConfigState

        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMint)

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

        // Create the pool transaction
        let tx: Transaction
        if (tokenType === TokenType.SPL) {
            const mintMetadata = deriveMintMetadata(baseMint)
            tx = await this.initializeSplPool({ ...baseParams, mintMetadata })
        } else {
            tx = await this.initializeToken2022Pool(baseParams)
        }

        // Add buy instructions if buyAmount is provided
        if (buyAmount) {
            // Validate swap amount
            validateSwapAmount(buyAmount)

            const {
                inputMint,
                outputMint,
                inputTokenProgram,
                outputTokenProgram,
            } = this.prepareSwapParams(
                false,
                { baseMint, poolType: tokenType },
                poolConfigState
            )

            // Add preInstructions for ATA creation and SOL wrapping
            const {
                ataTokenA: inputTokenAccount,
                ataTokenB: outputTokenAccount,
                instructions: preInstructions,
            } = await this.prepareTokenAccounts(
                poolCreator,
                poolCreator,
                inputMint,
                outputMint,
                inputTokenProgram,
                outputTokenProgram
            )

            // Add SOL wrapping instructions if needed
            if (inputMint.equals(NATIVE_MINT)) {
                preInstructions.push(
                    ...wrapSOLInstruction(
                        poolCreator,
                        inputTokenAccount,
                        BigInt(buyAmount.toString())
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
                const unwrapIx = unwrapSOLInstruction(poolCreator, poolCreator)
                unwrapIx && postInstructions.push(unwrapIx)
            }

            // Add the swap instruction
            const swapIx = await this.program.methods
                .swap({
                    amountIn: buyAmount,
                    minimumAmountOut,
                })
                .accountsPartial({
                    baseMint,
                    quoteMint,
                    pool,
                    baseVault,
                    quoteVault,
                    config,
                    poolAuthority: this.poolAuthority,
                    referralTokenAccount,
                    inputTokenAccount,
                    outputTokenAccount,
                    payer: poolCreator,
                    tokenBaseProgram:
                        tokenType === TokenType.SPL
                            ? TOKEN_PROGRAM_ID
                            : TOKEN_2022_PROGRAM_ID,
                    tokenQuoteProgram:
                        poolConfigState.quoteTokenFlag === TokenType.SPL
                            ? TOKEN_PROGRAM_ID
                            : TOKEN_2022_PROGRAM_ID,
                })
                .instruction()

            // Add all instructions to the transaction
            tx.add(...preInstructions, swapIx, ...postInstructions)
        }

        return tx
    }

    /**
     * Swap between base and quote
     * @param pool - The pool address
     * @param swapParam - The parameters for the swap
     * @returns A swap transaction
     */
    async swap(swapParam: SwapParam): Promise<Transaction> {
        const poolState = await this.state.getPool(swapParam.pool)

        if (!poolState) {
            throw new Error(`Pool not found: ${swapParam.pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        const { amountIn, minimumAmountOut, swapBaseForQuote, owner } =
            swapParam

        // Validate swap amount
        validateSwapAmount(amountIn)

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(swapBaseForQuote, poolState, poolConfigState)

        // Add preInstructions for ATA creation and SOL wrapping
        const {
            ataTokenA: inputTokenAccount,
            ataTokenB: outputTokenAccount,
            instructions: preInstructions,
        } = await this.prepareTokenAccounts(
            owner,
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
            const unwrapIx = unwrapSOLInstruction(owner, owner)

            unwrapIx && postInstructions.push(unwrapIx)
        }

        return this.program.methods
            .swap({
                amountIn,
                minimumAmountOut,
            })
            .accountsPartial({
                baseMint: poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                pool: swapParam.pool,
                baseVault: poolState.baseVault,
                quoteVault: poolState.quoteVault,
                config: poolState.config,
                poolAuthority: this.poolAuthority,
                referralTokenAccount: swapParam.referralTokenAccount,
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
     * @param slippageBps - Slippage tolerance in basis points (100 = 1%)
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
            slippageBps = 0,
            hasReferral,
            currentPoint,
        } = swapQuoteParam

        return swapQuote(
            virtualPool,
            config,
            swapBaseForQuote,
            amountIn,
            slippageBps,
            hasReferral,
            currentPoint
        )
    }
}
