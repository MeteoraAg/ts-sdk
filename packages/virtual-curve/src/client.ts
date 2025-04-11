import {
    TokenType,
    type ClaimTradingFeeParam,
    type CreateConfigParam,
    type CreatePartnerMetadataParam,
    type CreatePartnerMetadataParameters,
    type CreatePoolParam,
    type InitializeVirtualPoolWithSplTokenAccounts,
    type InitializeVirtualPoolWithToken2022Accounts,
    type MeteoraDammMigrationMetadata,
    type MigrateMeteoraDammCreateMetadataParam,
    type MigrateMeteoraDammLockLpTokenForCreatorParam,
    type MigrateMeteoraDammLockLpTokenForPartnerParam,
    type MigrateMeteoraDammParam,
    type PartnerWithdrawSurplusParam,
    type PoolConfig,
    type PoolConfigState,
    type SwapAccounts,
    type SwapParam,
    type VirtualCurveClientInterface,
    type VirtualPool,
    type VirtualPoolState,
} from './types'
import {
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
} from '@solana/web3.js'
import { VirtualCurve } from '.'
import {
    deriveEventAuthority,
    deriveMetadata,
    derivePartnerMetadata,
    derivePool,
    derivePoolAuthority,
    deriveTokenVault,
} from './derive'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    NATIVE_MINT,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { METADATA_PROGRAM_ID } from './constants'
import {
    createProgram,
    findAssociatedTokenAddress,
    unwrapSOLInstruction,
    wrapSOLInstruction,
} from './utils'
import type { Program } from '@coral-xyz/anchor'
import type { VirtualCurve as VirtualCurveIDL } from './idl/idl'
import BN from 'bn.js'
import { swapQuote } from './math/swapQuote'

export class VirtualCurveClient
    extends VirtualCurve
    implements VirtualCurveClientInterface
{
    public pool: PublicKey
    public virtualPoolState: VirtualPoolState
    public poolConfigState: PoolConfigState

    constructor(
        program: Program<VirtualCurveIDL>,
        pool: PublicKey,
        virtualPoolState: VirtualPoolState,
        poolConfigState: PoolConfigState
    ) {
        super(program)

        this.pool = pool
        this.virtualPoolState = virtualPoolState
        this.poolConfigState = poolConfigState
    }

    /**
     * Create a new VirtualCurveClient instance
     * @param connection - The connection to the Solana network
     * @param pool - The public key of the pool
     * @returns A new VirtualCurveClient instance
     */
    static async create(
        connection: Connection,
        pool: PublicKey
    ): Promise<VirtualCurveClient> {
        const { program } = createProgram(connection)
        const virtualPoolState = await program.account.virtualPool.fetch(pool)
        const poolConfigState = await program.account.poolConfig.fetch(
            virtualPoolState.config
        )
        return new VirtualCurveClient(
            program,
            pool,
            virtualPoolState,
            poolConfigState
        )
    }

    ////////////////////
    // MAIN FUNCTIONS //
    ////////////////////

    /**
     * Create a new pool
     * @param connection - The connection to the Solana network
     * @param createPoolParam - The parameters for the pool
     * @returns A new pool
     */
    static async createPool(
        connection: Connection,
        createPoolParam: CreatePoolParam
    ): Promise<Transaction> {
        const { program } = createProgram(connection)
        const {
            quoteMint,
            baseMint,
            config,
            baseTokenType,
            quoteTokenType,
            name,
            symbol,
            uri,
            creator,
        } = createPoolParam

        const eventAuthority = deriveEventAuthority(program.programId)
        const poolAuthority = derivePoolAuthority(program.programId)
        const pool = derivePool(quoteMint, baseMint, config, program.programId)
        const baseVault = deriveTokenVault(pool, baseMint, program.programId)
        const quoteVault = deriveTokenVault(pool, quoteMint, program.programId)
        const baseMetadata = deriveMetadata(baseMint)

        if (baseTokenType === TokenType.SPL) {
            const accounts: InitializeVirtualPoolWithSplTokenAccounts = {
                pool,
                config,
                creator,
                mintMetadata: baseMetadata,
                program: program.programId,
                tokenQuoteProgram:
                    quoteTokenType === TokenType.SPL
                        ? TOKEN_PROGRAM_ID
                        : TOKEN_2022_PROGRAM_ID,
                baseMint,
                payer: creator,
                poolAuthority,
                baseVault,
                quoteVault,
                quoteMint,
                eventAuthority,
                metadataProgram: METADATA_PROGRAM_ID,
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
                creator,
                program: program.programId,
                tokenQuoteProgram:
                    quoteTokenType === TokenType.SPL
                        ? TOKEN_PROGRAM_ID
                        : TOKEN_2022_PROGRAM_ID,
                baseMint,
                payer: creator,
                poolAuthority,
                baseVault,
                quoteVault,
                quoteMint,
                eventAuthority,
                systemProgram: SystemProgram.programId,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
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
     * Swap between base and quote
     * @param swapParam - The parameters for the swap
     * @returns A swap transaction
     */
    async swap(swapParam: SwapParam): Promise<Transaction> {
        const { amountIn, minimumAmountOut, swapBaseForQuote, owner } =
            swapParam

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            (() => {
                if (swapBaseForQuote) {
                    return {
                        inputMint: new PublicKey(
                            this.virtualPoolState.baseMint
                        ),
                        outputMint: new PublicKey(
                            this.poolConfigState.quoteMint
                        ),
                        inputTokenProgram:
                            this.virtualPoolState.poolType === TokenType.SPL
                                ? TOKEN_PROGRAM_ID
                                : TOKEN_2022_PROGRAM_ID,
                        outputTokenProgram:
                            this.poolConfigState.quoteTokenFlag ===
                            TokenType.SPL
                                ? TOKEN_PROGRAM_ID
                                : TOKEN_2022_PROGRAM_ID,
                    }
                } else {
                    return {
                        inputMint: new PublicKey(
                            this.poolConfigState.quoteMint
                        ),
                        outputMint: new PublicKey(
                            this.virtualPoolState.baseMint
                        ),
                        inputTokenProgram:
                            this.poolConfigState.quoteTokenFlag ===
                            TokenType.SPL
                                ? TOKEN_PROGRAM_ID
                                : TOKEN_2022_PROGRAM_ID,
                        outputTokenProgram:
                            this.virtualPoolState.poolType === TokenType.SPL
                                ? TOKEN_PROGRAM_ID
                                : TOKEN_2022_PROGRAM_ID,
                    }
                }
            })()

        const eventAuthority = deriveEventAuthority(this.program.programId)
        const poolAuthority = derivePoolAuthority(this.program.programId)

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

        const isSOLInput = inputMint.toString() === NATIVE_MINT.toString()
        const isSOLOutput = outputMint.toString() === NATIVE_MINT.toString()

        const ixs = []
        const cleanupIxs = []
        if (isSOLInput) {
            ixs.push(
                createAssociatedTokenAccountIdempotentInstruction(
                    owner,
                    inputTokenAccount,
                    owner,
                    inputMint
                )
            )
            ixs.push(
                ...wrapSOLInstruction(
                    owner,
                    inputTokenAccount,
                    BigInt(amountIn.toString())
                )
            )
            cleanupIxs.push(unwrapSOLInstruction(owner))
        }

        ixs.push(
            createAssociatedTokenAccountIdempotentInstruction(
                owner,
                outputTokenAccount,
                owner,
                outputMint
            )
        )

        if (isSOLOutput) {
            cleanupIxs.push(unwrapSOLInstruction(owner))
        }

        const accounts: SwapAccounts = {
            baseMint: this.virtualPoolState.baseMint,
            quoteMint: this.poolConfigState.quoteMint,
            pool: this.pool,
            baseVault: this.virtualPoolState.baseVault,
            quoteVault: this.virtualPoolState.quoteVault,
            config: this.virtualPoolState.config,
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
            program: this.program.programId,
        }

        const transaction = await this.program.methods
            .swap({
                amountIn,
                minimumAmountOut,
            })
            .accounts(accounts)
            .transaction()
        return transaction
    }

    /**
     * Swap quote
     * @param virtualPool - The virtual pool
     * @param config - The config
     * @param swapBaseForQuote - Whether to swap base for quote
     * @param amountIn - The amount in
     * @param hasReferral - Whether the referral is enabled
     * @param currentPoint - The current point
     * @returns
     */
    swapQuote(
        virtualPool: VirtualPool,
        config: PoolConfig,
        swapBaseForQuote: boolean,
        amountIn: BN,
        hasReferral: boolean,
        currentPoint: BN
    ) {
        return swapQuote(
            virtualPool,
            config,
            swapBaseForQuote,
            amountIn,
            hasReferral,
            currentPoint
        )
    }

    ///////////////////////
    // PARTNER FUNCTIONS //
    ///////////////////////

    /**
     * Create a new config
     * @param connection - The connection to the Solana network
     * @param createConfigParam - The parameters for the config
     * @returns A new config
     */
    static async createConfig(
        connection: Connection,
        createConfigParam: CreateConfigParam
    ): Promise<Transaction> {
        const { program } = createProgram(connection)
        const { config, feeClaimer, owner, quoteMint, payer, ...configParam } =
            createConfigParam
        const eventAuthority = deriveEventAuthority(program.programId)
        const accounts = {
            config,
            feeClaimer,
            owner,
            quoteMint,
            payer,
            eventAuthority,
            program: program.programId,
        }

        return program.methods
            .createConfig(configParam)
            .accounts(accounts)
            .transaction()
    }

    /**
     * Claim trading fee
     * @param connection - The connection to the Solana network
     * @param claimTradingFeeParam - The parameters for the claim trading fee
     * @returns A claim trading fee transaction
     */
    async claimTradingFee(
        claimTradingFeeParam: ClaimTradingFeeParam
    ): Promise<Transaction> {
        const poolAuthority = derivePoolAuthority(this.program.programId)
        const eventAuthority = deriveEventAuthority(this.program.programId)

        const tokenBaseAccount = findAssociatedTokenAddress(
            claimTradingFeeParam.feeClaimer,
            this.virtualPoolState.baseMint,
            this.virtualPoolState.poolType === TokenType.SPL
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID
        )

        const tokenQuoteAccount = findAssociatedTokenAddress(
            claimTradingFeeParam.feeClaimer,
            this.poolConfigState.quoteMint,
            this.poolConfigState.quoteTokenFlag === TokenType.SPL
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID
        )

        const accounts = {
            poolAuthority,
            config: this.virtualPoolState.config,
            pool: claimTradingFeeParam.pool,
            tokenAAccount: tokenBaseAccount,
            tokenBAccount: tokenQuoteAccount,
            baseVault: this.virtualPoolState.baseVault,
            quoteVault: this.virtualPoolState.quoteVault,
            baseMint: this.virtualPoolState.baseMint,
            quoteMint: this.poolConfigState.quoteMint,
            feeClaimer: claimTradingFeeParam.feeClaimer,
            tokenBaseProgram:
                this.virtualPoolState.poolType === TokenType.SPL
                    ? TOKEN_PROGRAM_ID
                    : TOKEN_2022_PROGRAM_ID,
            tokenQuoteProgram:
                this.poolConfigState.quoteTokenFlag === TokenType.SPL
                    ? TOKEN_PROGRAM_ID
                    : TOKEN_2022_PROGRAM_ID,
            eventAuthority,
            program: this.program.programId,
        }

        return this.program.methods
            .claimTradingFee(
                claimTradingFeeParam.maxBaseAmount,
                claimTradingFeeParam.maxQuoteAmount
            )
            .accounts(accounts)
            .transaction()
    }

    /**
     * Create partner metadata
     * @param connection - The connection to the Solana network
     * @param feeClaimer - The partner's fee claimer account (must be a signer)
     * @param payer - The account paying for the metadata creation (must be a signer)
     * @param name - Partner's name
     * @param website - Partner's website
     * @param logo - Partner's logo URL
     * @returns A create partner metadata transaction
     */
    static async createPartnerMetadata(
        connection: Connection,
        createPartnerMetadataParam: CreatePartnerMetadataParam
    ): Promise<Transaction> {
        const { program } = createProgram(connection)
        const eventAuthority = deriveEventAuthority(program.programId)
        const partnerMetadata = derivePartnerMetadata(
            createPartnerMetadataParam.feeClaimer,
            program.programId
        )

        const partnerMetadataParam: CreatePartnerMetadataParameters = {
            padding: new Array(96).fill(0),
            name: createPartnerMetadataParam.name,
            website: createPartnerMetadataParam.website,
            logo: createPartnerMetadataParam.logo,
        }

        const accounts = {
            partnerMetadata,
            payer: createPartnerMetadataParam.payer,
            feeClaimer: createPartnerMetadataParam.feeClaimer,
            systemProgram: SystemProgram.programId,
            eventAuthority,
            program: program.programId,
        }

        return program.methods
            .createPartnerMetadata(partnerMetadataParam)
            .accounts(accounts)
            .transaction()
    }

    /**
     * Partner withdraw surplus
     * @param connection - The connection to the Solana network
     * @param params - The parameters for the partner withdraw surplus
     * @returns A partner withdraw surplus transaction
     */
    async partnerWithdrawSurplus(
        partnerWithdrawSurplusParam: PartnerWithdrawSurplusParam
    ): Promise<Transaction> {
        const poolAuthority = derivePoolAuthority(this.program.programId)
        const eventAuthority = deriveEventAuthority(this.program.programId)

        const tokenQuoteAccount = findAssociatedTokenAddress(
            partnerWithdrawSurplusParam.feeClaimer,
            this.poolConfigState.quoteMint,
            this.poolConfigState.quoteTokenFlag === TokenType.SPL
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID
        )

        const accounts = {
            poolAuthority,
            config: this.virtualPoolState.config,
            virtualPool: partnerWithdrawSurplusParam.virtualPool,
            tokenQuoteAccount,
            quoteVault: this.virtualPoolState.quoteVault,
            quoteMint: this.poolConfigState.quoteMint,
            feeClaimer: partnerWithdrawSurplusParam.feeClaimer,
            tokenQuoteProgram:
                this.poolConfigState.quoteTokenFlag === TokenType.SPL
                    ? TOKEN_PROGRAM_ID
                    : TOKEN_2022_PROGRAM_ID,
            eventAuthority,
            program: this.program.programId,
        }

        return this.program.methods
            .partnerWithdrawSurplus()
            .accounts(accounts)
            .transaction()
    }

    /////////////////////////
    // MIGRATION FUNCTIONS //
    /////////////////////////

    /////////////
    // DAMM V1 //
    /////////////

    /////////////
    // DAMM V2 //
    /////////////

    /**
     * Create metadata for the migration of Meteora DAMM
     * @param connection - The connection to the Solana network
     * @param MigrateMeteoraDammCreateMetadataParam - The parameters for the migration
     * @returns A migration transaction
     */
    static async migrationMeteoraDammCreateMetadata(
        connection: Connection,
        MigrateMeteoraDammCreateMetadataParam: MigrateMeteoraDammCreateMetadataParam
    ): Promise<Transaction> {
        const { program } = createProgram(connection)

        return program.methods
            .migrationMeteoraDammCreateMetadata()
            .accounts({
                ...MigrateMeteoraDammCreateMetadataParam,
                program: program.programId,
            })
            .transaction()
    }

    /**
     * Migrate Meteora DAMM
     * @param connection - The connection to the Solana network
     * @param migrateMeteoraDammParam - The parameters for the migration
     * @returns A migration transaction
     */
    static async migrateMeteoraDamm(
        connection: Connection,
        migrateMeteoraDammParam: MigrateMeteoraDammParam
    ): Promise<Transaction> {
        const { program } = createProgram(connection)
        const eventAuthority = deriveEventAuthority(program.programId)
        const accounts = {
            ...migrateMeteoraDammParam,
            eventAuthority,
            program: program.programId,
        }

        return program.methods
            .migrateMeteoraDamm()
            .accounts(accounts)
            .transaction()
    }

    /**
     * Migrate Meteora DAMM lock LP token
     * @param connection - The connection to the Solana network
     * @param lockLpTokenParam - The parameters for the migration
     * @param isCreator - Whether the lock is for creator or partner
     * @returns A migration transaction
     */
    static async migrateMeteoraDammLockLpToken(
        connection: Connection,
        lockLpTokenParam:
            | MigrateMeteoraDammLockLpTokenForCreatorParam
            | MigrateMeteoraDammLockLpTokenForPartnerParam,
        isCreator: boolean
    ): Promise<Transaction> {
        const { program } = createProgram(connection)
        const eventAuthority = deriveEventAuthority(program.programId)
        const accounts = {
            ...lockLpTokenParam,
            eventAuthority,
            program: program.programId,
        }

        if (isCreator) {
            return program.methods
                .migrateMeteoraDammLockLpTokenForCreator()
                .accounts(accounts)
                .transaction()
        } else {
            return program.methods
                .migrateMeteoraDammLockLpTokenForPartner()
                .accounts(accounts)
                .transaction()
        }
    }

    /**
     * Get meteora DAMM migration metadata
     * @param connection - The connection to the Solana network
     * @param metadataAddress - The address of the meteora DAMM migration metadata
     * @returns A meteora DAMM migration metadata
     */
    static async getMeteoraDammMigrationMetadata(
        connection: Connection,
        metadataAddress: PublicKey | string
    ): Promise<MeteoraDammMigrationMetadata> {
        const { program } = createProgram(connection)
        const metadata =
            await program.account.meteoraDammMigrationMetadata.fetch(
                metadataAddress instanceof PublicKey
                    ? metadataAddress
                    : new PublicKey(metadataAddress)
            )

        return metadata
    }
}
