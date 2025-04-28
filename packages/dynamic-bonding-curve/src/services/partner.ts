import {
    Commitment,
    SystemProgram,
    TransactionInstruction,
    type Connection,
    type Transaction,
} from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './DbcProgram'
import {
    type ClaimTradingFeeParam,
    type ConfigParameters,
    type CreateConfigParam,
    type CreatePartnerMetadataParam,
    type CreatePartnerMetadataParameters,
    type PartnerWithdrawSurplusParam,
    type WithdrawLeftoverParam,
    BuildCurveAndCreateConfigByMarketCapParam,
    BuildCurveAndCreateConfigParam,
} from '../types'
import {
    derivePartnerMetadata,
    unwrapSOLInstruction,
    validateConfigParameters,
    buildCurve,
    buildCurveByMarketCap,
    getTokenProgram,
    getOrCreateATAInstruction,
} from '../helpers'
import { NATIVE_MINT } from '@solana/spl-token'

export class PartnerService extends DynamicBondingCurveProgram {
    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
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
     * Create partner metadata
     * @param createPartnerMetadataParam - The parameters for the partner metadata
     * @returns A create partner metadata transaction
     */
    async createPartnerMetadata(
        createPartnerMetadataParam: CreatePartnerMetadataParam
    ): Promise<Transaction> {
        const partnerMetadata = derivePartnerMetadata(
            createPartnerMetadataParam.feeClaimer,
            this.program.programId
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
    async claimTradingFee(
        claimTradingFeeParam: ClaimTradingFeeParam
    ): Promise<Transaction> {
        const virtualPoolState = await this.fetchVirtualPoolState(
            claimTradingFeeParam.pool
        )

        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${claimTradingFeeParam.pool.toString()}`
            )
        }

        const poolConfigState = await this.fetchPoolConfigState(
            virtualPoolState.config
        )

        const tokenBaseProgram = getTokenProgram(poolConfigState.tokenType)
        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )

        const postInstructions: TransactionInstruction[] = []
        const {
            ataTokenA: tokenBaseAccount,
            ataTokenB: tokenQuoteAccount,
            instructions: preInstructions,
        } = await this.prepareTokenAccounts(
            claimTradingFeeParam.feeClaimer,
            virtualPoolState.baseMint,
            poolConfigState.quoteMint,
            tokenBaseProgram,
            tokenQuoteProgram
        )

        if (poolConfigState.quoteMint.equals(NATIVE_MINT)) {
            const unwrapSolIx = unwrapSOLInstruction(
                claimTradingFeeParam.feeClaimer
            )
            unwrapSolIx && postInstructions.push(unwrapSolIx)
        }

        return this.program.methods
            .claimTradingFee(
                claimTradingFeeParam.maxBaseAmount,
                claimTradingFeeParam.maxQuoteAmount
            )
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: virtualPoolState.config,
                pool: claimTradingFeeParam.pool,
                tokenAAccount: tokenBaseAccount,
                tokenBAccount: tokenQuoteAccount,
                baseVault: virtualPoolState.baseVault,
                quoteVault: virtualPoolState.quoteVault,
                baseMint: virtualPoolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                feeClaimer: claimTradingFeeParam.feeClaimer,
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
        const virtualPoolState = await this.fetchVirtualPoolState(
            partnerWithdrawSurplusParam.virtualPool
        )
        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${partnerWithdrawSurplusParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.fetchPoolConfigState(
            virtualPoolState.config
        )

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
                partnerWithdrawSurplusParam.feeClaimer
            )
            unwrapSolIx && postInstructions.push(unwrapSolIx)
        }
        return this.program.methods
            .partnerWithdrawSurplus()
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: virtualPoolState.config,
                virtualPool: partnerWithdrawSurplusParam.virtualPool,
                tokenQuoteAccount,
                quoteVault: virtualPoolState.quoteVault,
                quoteMint: poolConfigState.quoteMint,
                feeClaimer: partnerWithdrawSurplusParam.feeClaimer,
                tokenQuoteProgram,
            })
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Withdraw leftover
     * @param withdrawLeftoverParam - The parameters for the withdraw leftover
     * @returns A withdraw leftover transaction
     */
    async withdrawLeftover(
        withdrawLeftoverParam: WithdrawLeftoverParam
    ): Promise<Transaction> {
        const virtualPoolState = await this.fetchVirtualPoolState(
            withdrawLeftoverParam.virtualPool
        )

        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${withdrawLeftoverParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.fetchPoolConfigState(
            virtualPoolState.config
        )

        const tokenBaseProgram = getTokenProgram(poolConfigState.tokenType)

        const preInstructions: TransactionInstruction[] = []
        const { ataPubkey: tokenBaseAccount, ix: createBaseTokenAccountIx } =
            await getOrCreateATAInstruction(
                this.connection,
                virtualPoolState.baseMint,
                poolConfigState.leftoverReceiver,
                poolConfigState.leftoverReceiver,
                true,
                tokenBaseProgram
            )

        createBaseTokenAccountIx &&
            preInstructions.push(createBaseTokenAccountIx)

        return this.program.methods
            .withdrawLeftover()
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: virtualPoolState.config,
                virtualPool: withdrawLeftoverParam.virtualPool,
                tokenBaseAccount,
                baseVault: virtualPoolState.baseVault,
                baseMint: virtualPoolState.baseMint,
                leftoverReceiver: poolConfigState.leftoverReceiver,
                tokenBaseProgram,
            })
            .preInstructions(preInstructions)
            .transaction()
    }
}
