import {
    Commitment,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
    type Connection,
    type Transaction,
} from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    type ClaimTradingFeeParam,
    type ConfigParameters,
    type CreateConfigParam,
    type CreatePartnerMetadataParam,
    type CreatePartnerMetadataParameters,
    type PartnerWithdrawSurplusParam,
    BuildCurveAndCreateConfigByMarketCapParam,
    BuildCurveAndCreateConfigParam,
    BuildCurveGraphAndCreateConfigParam,
} from '../types'
import {
    derivePartnerMetadata,
    unwrapSOLInstruction,
    validateConfigParameters,
    buildCurve,
    buildCurveByMarketCap,
    getTokenProgram,
    getOrCreateATAInstruction,
    buildCurveGraph,
    isNativeSol,
    findAssociatedTokenAddress,
} from '../helpers'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    NATIVE_MINT,
} from '@solana/spl-token'
import { StateService } from './state'

export class PartnerService extends DynamicBondingCurveProgram {
    private state: StateService

    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
        this.state = new StateService(connection, commitment)
    }

    /**
     * Create a new config
     * @param createConfigParam - The parameters for the config
     * @returns A new config
     */
    async createConfig(
        createConfigParam: CreateConfigParam
    ): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            ...configParam
        } = createConfigParam

        // error checks
        validateConfigParameters({ ...configParam, leftoverReceiver })

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
     * Build curve and create a new custom constant product config
     * @param buildCurveAndCreateConfigParam - The parameters for the custom constant product config
     * @returns A new custom constant product config
     */
    async buildCurveAndCreateConfig(
        buildCurveAndCreateConfigParam: BuildCurveAndCreateConfigParam
    ): Promise<Transaction> {
        const {
            buildCurveParam,
            feeClaimer,
            leftoverReceiver,
            payer,
            quoteMint,
            config,
        } = buildCurveAndCreateConfigParam

        const curveConfig: ConfigParameters = buildCurve({
            ...buildCurveParam,
        })

        // error checks
        validateConfigParameters({
            ...curveConfig,
            leftoverReceiver,
        })

        return this.program.methods
            .createConfig(curveConfig)
            .accounts({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint,
                payer,
            })
            .transaction()
    }

    /**
     * Build curve by market cap and create a new custom constant product config
     * @param buildCurveAndCreateConfigByMarketCapParam - The parameters for the custom constant product config
     * @returns A new custom constant product config
     */
    async buildCurveAndCreateConfigByMarketCap(
        buildCurveAndCreateConfigByMarketCapParam: BuildCurveAndCreateConfigByMarketCapParam
    ): Promise<Transaction> {
        const {
            buildCurveByMarketCapParam,
            feeClaimer,
            leftoverReceiver,
            payer,
            quoteMint,
            config,
        } = buildCurveAndCreateConfigByMarketCapParam

        const curveConfig: ConfigParameters = buildCurveByMarketCap({
            ...buildCurveByMarketCapParam,
        })

        // error checks
        validateConfigParameters({
            ...curveConfig,
            leftoverReceiver,
        })

        return this.program.methods
            .createConfig(curveConfig)
            .accounts({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint,
                payer,
            })
            .transaction()
    }

    /**
     * Build a custom graph curve and create a new config
     * @param buildCurveGraphAndCreateConfigParam - The parameters for the custom constant product config
     * @returns A new custom constant product config
     */
    async buildCurveGraphAndCreateConfig(
        buildCurveGraphAndCreateConfigParam: BuildCurveGraphAndCreateConfigParam
    ): Promise<Transaction> {
        const {
            buildCurveGraphParam,
            feeClaimer,
            leftoverReceiver,
            payer,
            quoteMint,
            config,
        } = buildCurveGraphAndCreateConfigParam

        const curveConfig: ConfigParameters = buildCurveGraph({
            ...buildCurveGraphParam,
        })

        // error checks
        validateConfigParameters({
            ...curveConfig,
            leftoverReceiver,
        })

        return this.program.methods
            .createConfig(curveConfig)
            .accounts({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint,
                payer,
            })
            .transaction()
    }

    /**
     * Create partner metadata
     * @param createPartnerMetadataParam - The parameters for the partner metadata
     * @returns A create partner metadata transaction
     */
    async createPartnerMetadata(
        createPartnerMetadataParam: CreatePartnerMetadataParam
    ): Promise<Transaction> {
        const partnerMetadata = derivePartnerMetadata(
            createPartnerMetadataParam.feeClaimer
        )

        const partnerMetadataParam: CreatePartnerMetadataParameters = {
            padding: new Array(96).fill(0),
            name: createPartnerMetadataParam.name,
            website: createPartnerMetadataParam.website,
            logo: createPartnerMetadataParam.logo,
        }

        return this.program.methods
            .createPartnerMetadata(partnerMetadataParam)
            .accountsPartial({
                partnerMetadata,
                payer: createPartnerMetadataParam.payer,
                feeClaimer: createPartnerMetadataParam.feeClaimer,
                systemProgram: SystemProgram.programId,
            })
            .transaction()
    }

    /**
     * Claim trading fee
     * @param claimTradingFeeParam - The parameters for the claim trading fee
     * @returns A claim trading fee transaction
     */
    async claimPartnerTradingFee(
        claimTradingFeeParam: ClaimTradingFeeParam
    ): Promise<Transaction> {
        const {
            feeClaimer,
            payer,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
            tempWSolAcc,
        } = claimTradingFeeParam

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

        const partnerFeeMetrics =
            await this.state.getPoolPartnerFeeMetrics(pool)

        const partnerBaseFee = partnerFeeMetrics.partnerBaseFee
        const partnerQuoteFee = partnerFeeMetrics.partnerQuoteFee

        if (partnerBaseFee.isZero() && partnerQuoteFee.isZero()) {
            throw new Error('No partner fees to claim')
        }

        const isSOLQuoteMint = isNativeSol(poolConfigState.quoteMint)

        let tokenBaseAccount: PublicKey
        let tokenQuoteAccount: PublicKey

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        if (isSOLQuoteMint) {
            tokenBaseAccount = findAssociatedTokenAddress(
                receiver ? receiver : feeClaimer,
                poolState.baseMint,
                tokenBaseProgram
            )
            tokenQuoteAccount = findAssociatedTokenAddress(
                tempWSolAcc,
                poolConfigState.quoteMint,
                tokenQuoteProgram
            )

            const createTokenQuoteAccountIx =
                createAssociatedTokenAccountIdempotentInstruction(
                    payer,
                    tokenQuoteAccount,
                    tempWSolAcc,
                    poolConfigState.quoteMint
                )
            createTokenQuoteAccountIx &&
                preInstructions.push(createTokenQuoteAccountIx)

            const createTokenBaseAccountIx =
                createAssociatedTokenAccountIdempotentInstruction(
                    payer,
                    tokenBaseAccount,
                    receiver ? receiver : feeClaimer,
                    poolState.baseMint
                )
            createTokenBaseAccountIx &&
                preInstructions.push(createTokenBaseAccountIx)

            const unwrapSolIx = unwrapSOLInstruction(
                tempWSolAcc,
                receiver ? receiver : feeClaimer
            )
            unwrapSolIx && postInstructions.push(unwrapSolIx)
        } else {
            const tokenAccountsResult = await this.prepareTokenAccounts(
                receiver ? receiver : feeClaimer,
                payer,
                poolState.baseMint,
                poolConfigState.quoteMint,
                tokenBaseProgram,
                tokenQuoteProgram
            )

            tokenBaseAccount = tokenAccountsResult.ataTokenA
            tokenQuoteAccount = tokenAccountsResult.ataTokenB
            preInstructions.push(...tokenAccountsResult.instructions)
        }

        return this.program.methods
            .claimTradingFee(maxBaseAmount, maxQuoteAmount)
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: poolState.config,
                pool,
                tokenAAccount: tokenBaseAccount,
                tokenBAccount: tokenQuoteAccount,
                baseVault: poolState.baseVault,
                quoteVault: poolState.quoteVault,
                baseMint: poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                feeClaimer,
                tokenBaseProgram,
                tokenQuoteProgram,
            })
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Partner withdraw surplus
     * @param partnerWithdrawSurplusParam - The parameters for the partner withdraw surplus
     * @returns A partner withdraw surplus transaction
     */
    async partnerWithdrawSurplus(
        partnerWithdrawSurplusParam: PartnerWithdrawSurplusParam
    ): Promise<Transaction> {
        const poolState = await this.state.getPool(
            partnerWithdrawSurplusParam.virtualPool
        )
        if (!poolState) {
            throw new Error(
                `Pool not found: ${partnerWithdrawSurplusParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const { ataPubkey: tokenQuoteAccount, ix: createQuoteTokenAccountIx } =
            await getOrCreateATAInstruction(
                this.connection,
                poolConfigState.quoteMint,
                partnerWithdrawSurplusParam.feeClaimer,
                partnerWithdrawSurplusParam.feeClaimer,
                true,
                tokenQuoteProgram
            )

        createQuoteTokenAccountIx &&
            preInstructions.push(createQuoteTokenAccountIx)

        if (poolConfigState.quoteMint.equals(NATIVE_MINT)) {
            const unwrapSolIx = unwrapSOLInstruction(
                partnerWithdrawSurplusParam.feeClaimer,
                partnerWithdrawSurplusParam.feeClaimer
            )
            unwrapSolIx && postInstructions.push(unwrapSolIx)
        }
        return this.program.methods
            .partnerWithdrawSurplus()
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: poolState.config,
                virtualPool: partnerWithdrawSurplusParam.virtualPool,
                tokenQuoteAccount,
                quoteVault: poolState.quoteVault,
                quoteMint: poolConfigState.quoteMint,
                feeClaimer: partnerWithdrawSurplusParam.feeClaimer,
                tokenQuoteProgram,
            })
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }
}
