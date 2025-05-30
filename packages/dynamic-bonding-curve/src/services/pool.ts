import {
    Commitment,
    PublicKey,
    TransactionInstruction,
    type Connection,
    Transaction,
} from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    ConfigParameters,
    CreateConfigAndPoolParam,
    CreateConfigAndPoolWithFirstBuyParam,
    CreatePoolWithFirstBuyParam,
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
    getTokenType,
    prepareTokenAccountTx,
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
     * Private method to create config instruction
     * @param configParam - The config parameters
     * @param config - The config address
     * @param feeClaimer - The fee claimer address
     * @param leftoverReceiver - The leftover receiver address
     * @param quoteMint - The quote mint address
     * @param payer - The payer address
     * @returns A transaction that creates the config
     */
    private async createConfigInstruction(
        configParam: ConfigParameters,
        config: PublicKey,
        feeClaimer: PublicKey,
        leftoverReceiver: PublicKey,
        quoteMint: PublicKey,
        payer: PublicKey
    ): Promise<Transaction> {
        return this.program.methods
            .createConfig(configParam)
            .accountsPartial({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint,
                payer,
            })
            .transaction()
    }

    /**
     * Private method to create pool instruction
     * @param createConfigAndPoolWithFirstBuyParam - The parameters for the config and pool and buy
     * @param configKey - The config key
     * @param quoteMintToken - The quote mint token
     * @param payerAddress - The payer address
     * @returns A transaction that creates the pool
     */
    private async createPoolInstruction(
        createConfigAndPoolWithFirstBuyParam: CreateConfigAndPoolWithFirstBuyParam,
        configKey: PublicKey,
        quoteMintToken: PublicKey,
        payerAddress: PublicKey
    ): Promise<Transaction> {
        const { baseMint, name, symbol, uri, poolCreator } =
            createConfigAndPoolWithFirstBuyParam.createPoolParam

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

        if (createConfigAndPoolWithFirstBuyParam.tokenType === TokenType.SPL) {
            const mintMetadata = deriveMintMetadata(baseMint)
            return this.initializeSplPool({
                ...baseParams,
                mintMetadata,
            })
        } else {
            return this.initializeToken2022Pool(baseParams)
        }
    }

    /**
     * Private method to create first buy instruction
     * @param createConfigAndPoolWithFirstBuyParam - The parameters for the config and pool and buy
     * @param configKey - The config key
     * @param quoteMintToken - The quote mint token
     * @param payerAddress - The payer address
     * @returns Instructions for the first buy
     */
    private async createFirstBuyInstruction(
        createConfigAndPoolWithFirstBuyParam: CreateConfigAndPoolWithFirstBuyParam,
        configKey: PublicKey,
        quoteMintToken: PublicKey,
        payerAddress: PublicKey
    ): Promise<TransactionInstruction[]> {
        const { baseMint, poolCreator } =
            createConfigAndPoolWithFirstBuyParam.createPoolParam

        const {
            buyAmount,
            minimumAmountOut,
            quoteMintTokenAccount,
            referralTokenAccount,
        } = createConfigAndPoolWithFirstBuyParam.swapBuyParam

        if (!buyAmount) {
            return []
        }

        // error checks
        validateSwapAmount(buyAmount)

        const quoteTokenFlag = await getTokenType(
            this.connection,
            quoteMintToken
        )

        const { outputMint, outputTokenProgram } = this.prepareSwapParams(
            false,
            {
                baseMint,
                poolType: createConfigAndPoolWithFirstBuyParam.tokenType,
            },
            {
                quoteMint: quoteMintToken,
                quoteTokenFlag,
            }
        )

        const pool = deriveDbcPoolAddress(quoteMintToken, baseMint, configKey)
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMintToken)

        // Prepare output token account using prepareTokenAccountTx
        const { tokenAccount: outputTokenAccount, transaction: preTx } =
            await prepareTokenAccountTx(
                this.connection,
                poolCreator,
                payerAddress,
                outputMint,
                BigInt(buyAmount.toString()),
                outputTokenProgram
            )

        const swapIx = await this.program.methods
            .swap({
                amountIn: buyAmount,
                minimumAmountOut,
            })
            .accountsPartial({
                baseMint,
                quoteMint: quoteMintToken,
                pool,
                baseVault,
                quoteVault,
                config: configKey,
                poolAuthority: this.poolAuthority,
                referralTokenAccount,
                inputTokenAccount: quoteMintTokenAccount,
                outputTokenAccount,
                payer: poolCreator,
                tokenBaseProgram:
                    createConfigAndPoolWithFirstBuyParam.tokenType ===
                    TokenType.SPL
                        ? TOKEN_PROGRAM_ID
                        : TOKEN_2022_PROGRAM_ID,
                tokenQuoteProgram:
                    quoteTokenFlag === TokenType.SPL
                        ? TOKEN_PROGRAM_ID
                        : TOKEN_2022_PROGRAM_ID,
            })
            .instruction()

        return [...preTx.instructions, swapIx]
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
     * Create a new config and pool and buy tokens
     * @param createConfigAndPoolWithFirstBuyParam - The parameters for the config and pool and buy
     * @returns A transaction containing a new config key, a new token pool and the first initial buy of tokens
     */
    async createConfigAndPoolWithFirstBuy(
        createConfigAndPoolWithFirstBuyParam: CreateConfigAndPoolWithFirstBuyParam
    ): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            ...configParam
        } = createConfigAndPoolWithFirstBuyParam

        // error checks
        validateConfigParameters({ ...configParam, leftoverReceiver })

        const configKey = new PublicKey(config)
        const quoteMintToken = new PublicKey(quoteMint)
        const payerAddress = new PublicKey(payer)
        const feeClaimerAddress = new PublicKey(feeClaimer)
        const leftoverReceiverAddress = new PublicKey(leftoverReceiver)

        const transaction = new Transaction()

        // create config instruction
        const createConfigIx = await this.createConfigInstruction(
            configParam,
            configKey,
            feeClaimerAddress,
            leftoverReceiverAddress,
            quoteMintToken,
            payerAddress
        )
        transaction.add(createConfigIx)

        // create pool instruction
        const createPoolIx = await this.createPoolInstruction(
            createConfigAndPoolWithFirstBuyParam,
            configKey,
            quoteMintToken,
            payerAddress
        )
        transaction.add(createPoolIx)

        // create first buy instructions if buyAmount is provided
        const firstBuyInstruction = await this.createFirstBuyInstruction(
            createConfigAndPoolWithFirstBuyParam,
            configKey,
            quoteMintToken,
            payerAddress
        )
        transaction.add(...firstBuyInstruction)

        return transaction
    }

    /**
     * Create a new pool and buy tokens
     * @param createPoolWithFirstBuyParam - The parameters for the pool and buy
     * @returns A transaction that creates the pool and buys tokens
     */
    async createPoolWithFirstBuy(
        createPoolWithFirstBuyParam: CreatePoolWithFirstBuyParam
    ): Promise<Transaction> {
        const { baseMint, config, name, symbol, uri, payer, poolCreator } =
            createPoolWithFirstBuyParam.createPoolParam

        const { buyAmount, minimumAmountOut, referralTokenAccount } =
            createPoolWithFirstBuyParam

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

        // create pool transaction
        let tx: Transaction
        if (tokenType === TokenType.SPL) {
            const mintMetadata = deriveMintMetadata(baseMint)
            tx = await this.initializeSplPool({ ...baseParams, mintMetadata })
        } else {
            tx = await this.initializeToken2022Pool(baseParams)
        }

        // add buy instructions if buyAmount is provided
        if (buyAmount) {
            // error checks
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

            // add SOL wrapping instructions if needed
            if (inputMint.equals(NATIVE_MINT)) {
                preInstructions.push(
                    ...wrapSOLInstruction(
                        poolCreator,
                        inputTokenAccount,
                        BigInt(buyAmount.toString())
                    )
                )
            }

            // add postInstructions for SOL unwrapping if needed
            const postInstructions: TransactionInstruction[] = []
            if (
                [inputMint.toBase58(), outputMint.toBase58()].includes(
                    NATIVE_MINT.toBase58()
                )
            ) {
                const unwrapIx = unwrapSOLInstruction(poolCreator, poolCreator)
                unwrapIx && postInstructions.push(unwrapIx)
            }

            const swapTx = await this.program.methods
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
                .preInstructions(preInstructions)
                .postInstructions(postInstructions)
                .transaction()

            tx.add(...swapTx.instructions)
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

        // error checks
        validateSwapAmount(amountIn)

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(swapBaseForQuote, poolState, poolConfigState)

        // add preInstructions for ATA creation and SOL wrapping
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

        // add SOL wrapping instructions if needed
        if (inputMint.equals(NATIVE_MINT)) {
            preInstructions.push(
                ...wrapSOLInstruction(
                    owner,
                    inputTokenAccount,
                    BigInt(amountIn.toString())
                )
            )
        }

        // add postInstructions for SOL unwrapping
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
