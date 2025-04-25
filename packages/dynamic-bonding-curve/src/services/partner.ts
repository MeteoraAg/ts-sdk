import {
    SystemProgram,
    TransactionInstruction,
    type Connection,
    type Transaction,
} from '@solana/web3.js'
import type { DynamicBondingCurveProgramClient } from '../client'
import {
    TokenType,
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
    deriveEventAuthority,
    derivePartnerMetadata,
    derivePoolAuthority,
} from '../derive'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    NATIVE_MINT,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { findAssociatedTokenAddress, unwrapSOLInstruction } from '../utils'
import { validateConfigParameters } from '../checks'
import { buildCurve, buildCurveByMarketCap } from '../build'

export class PartnerService {
    private connection: Connection

    constructor(private programClient: DynamicBondingCurveProgramClient) {
        this.connection = this.programClient.getProgram().provider.connection
    }

    /**
     * Create a new config
     * @param createConfigParam - The parameters for the config
     * @returns A new config
     */
    async createConfig(
        createConfigParam: CreateConfigParam
    ): Promise<Transaction> {
        const program = this.programClient.getProgram()

        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            ...configParam
        } = createConfigParam

        const eventAuthority = deriveEventAuthority()

        // error checks
        validateConfigParameters({ ...configParam, leftoverReceiver })

        const accounts = {
            config,
            feeClaimer,
            leftoverReceiver,
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
     * Build curve and create a new custom constant product config
     * @param buildCurveAndCreateConfigParam - The parameters for the custom constant product config
     * @returns A new custom constant product config
     */
    async buildCurveAndCreateConfig(
        buildCurveAndCreateConfigParam: BuildCurveAndCreateConfigParam
    ): Promise<Transaction> {
        const program = this.programClient.getProgram()

        const {
            buildCurveParam,
            feeClaimer,
            leftoverReceiver,
            payer,
            quoteMint,
            config,
        } = buildCurveAndCreateConfigParam

        const eventAuthority = deriveEventAuthority()

        const curveConfig: ConfigParameters = buildCurve({
            ...buildCurveParam,
        })

        // error checks
        validateConfigParameters({
            ...curveConfig,
            leftoverReceiver,
        })

        const accounts = {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            eventAuthority,
            program: program.programId,
        }

        return program.methods
            .createConfig(curveConfig)
            .accounts(accounts)
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
        const program = this.programClient.getProgram()

        const {
            buildCurveByMarketCapParam,
            feeClaimer,
            leftoverReceiver,
            payer,
            quoteMint,
            config,
        } = buildCurveAndCreateConfigByMarketCapParam

        const eventAuthority = deriveEventAuthority()

        const curveConfig: ConfigParameters = buildCurveByMarketCap({
            ...buildCurveByMarketCapParam,
        })

        // error checks
        validateConfigParameters({
            ...curveConfig,
            leftoverReceiver,
        })

        const accounts = {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            eventAuthority,
            program: program.programId,
        }

        return program.methods
            .createConfig(curveConfig)
            .accounts(accounts)
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
        const program = this.programClient.getProgram()
        const eventAuthority = deriveEventAuthority()
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
     * Claim trading fee
     * @param claimTradingFeeParam - The parameters for the claim trading fee
     * @returns A claim trading fee transaction
     */
    async claimTradingFee(
        claimTradingFeeParam: ClaimTradingFeeParam
    ): Promise<Transaction> {
        const program = this.programClient.getProgram()
        const poolAuthority = derivePoolAuthority(program.programId)
        const eventAuthority = deriveEventAuthority()

        const virtualPoolState = await this.programClient.getPool(
            claimTradingFeeParam.pool
        )

        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${claimTradingFeeParam.pool.toString()}`
            )
        }

        const poolConfigState = await this.programClient.getPoolConfig(
            virtualPoolState.config
        )

        const tokenBaseProgram =
            poolConfigState.tokenType === TokenType.SPL
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID

        const tokenQuoteProgram =
            poolConfigState.quoteTokenFlag === TokenType.SPL
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID

        const tokenBaseAccount = findAssociatedTokenAddress(
            claimTradingFeeParam.feeClaimer,
            virtualPoolState.baseMint,
            tokenBaseProgram
        )

        const tokenQuoteAccount = findAssociatedTokenAddress(
            claimTradingFeeParam.feeClaimer,
            poolConfigState.quoteMint,
            tokenQuoteProgram
        )

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const createBaseTokenAccountIx =
            createAssociatedTokenAccountIdempotentInstruction(
                claimTradingFeeParam.feeClaimer,
                tokenBaseAccount,
                claimTradingFeeParam.feeClaimer,
                virtualPoolState.baseMint,
                tokenBaseProgram
            )

        if (createBaseTokenAccountIx) {
            preInstructions.push(createBaseTokenAccountIx)
        }

        const createQuoteTokenAccountIx =
            createAssociatedTokenAccountIdempotentInstruction(
                claimTradingFeeParam.feeClaimer,
                tokenQuoteAccount,
                claimTradingFeeParam.feeClaimer,
                poolConfigState.quoteMint,
                tokenQuoteProgram
            )

        if (createQuoteTokenAccountIx) {
            preInstructions.push(createQuoteTokenAccountIx)
        }

        if (poolConfigState.quoteMint.equals(NATIVE_MINT)) {
            const unwrapSolIx = unwrapSOLInstruction(
                claimTradingFeeParam.feeClaimer
            )

            if (unwrapSolIx) {
                postInstructions.push(unwrapSolIx)
            }
        }

        const accounts = {
            poolAuthority,
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
            eventAuthority,
            program: program.programId,
        }

        return program.methods
            .claimTradingFee(
                claimTradingFeeParam.maxBaseAmount,
                claimTradingFeeParam.maxQuoteAmount
            )
            .accounts(accounts)
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
        const program = this.programClient.getProgram()
        const poolAuthority = derivePoolAuthority(program.programId)
        const eventAuthority = deriveEventAuthority()

        const virtualPoolState = await this.programClient.getPool(
            partnerWithdrawSurplusParam.virtualPool
        )
        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${partnerWithdrawSurplusParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.programClient.getPoolConfig(
            virtualPoolState.config
        )

        const tokenQuoteProgram =
            poolConfigState.quoteTokenFlag === TokenType.SPL
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID

        const tokenQuoteAccount = findAssociatedTokenAddress(
            partnerWithdrawSurplusParam.feeClaimer,
            poolConfigState.quoteMint,
            tokenQuoteProgram
        )

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const createQuoteTokenAccountIx =
            createAssociatedTokenAccountIdempotentInstruction(
                partnerWithdrawSurplusParam.feeClaimer,
                tokenQuoteAccount,
                partnerWithdrawSurplusParam.feeClaimer,
                poolConfigState.quoteMint,
                tokenQuoteProgram
            )

        if (createQuoteTokenAccountIx) {
            preInstructions.push(createQuoteTokenAccountIx)
        }

        if (poolConfigState.quoteMint.equals(NATIVE_MINT)) {
            const unwrapSolIx = unwrapSOLInstruction(
                partnerWithdrawSurplusParam.feeClaimer
            )

            if (unwrapSolIx) {
                postInstructions.push(unwrapSolIx)
            }
        }

        const accounts = {
            poolAuthority,
            config: virtualPoolState.config,
            virtualPool: partnerWithdrawSurplusParam.virtualPool,
            tokenQuoteAccount,
            quoteVault: virtualPoolState.quoteVault,
            quoteMint: poolConfigState.quoteMint,
            feeClaimer: partnerWithdrawSurplusParam.feeClaimer,
            tokenQuoteProgram,
            eventAuthority,
            program: program.programId,
        }

        return program.methods
            .partnerWithdrawSurplus()
            .accounts(accounts)
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
        const program = this.programClient.getProgram()
        const poolAuthority = derivePoolAuthority(program.programId)
        const eventAuthority = deriveEventAuthority()

        const virtualPoolState = await this.programClient.getPool(
            withdrawLeftoverParam.virtualPool
        )

        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${withdrawLeftoverParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.programClient.getPoolConfig(
            virtualPoolState.config
        )

        const tokenBaseProgram =
            poolConfigState.tokenType === TokenType.SPL
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID

        const tokenBaseAccount = findAssociatedTokenAddress(
            poolConfigState.leftoverReceiver,
            virtualPoolState.baseMint,
            tokenBaseProgram
        )

        const preInstructions: TransactionInstruction[] = []

        const createBaseTokenAccountIx =
            createAssociatedTokenAccountIdempotentInstruction(
                poolConfigState.leftoverReceiver,
                tokenBaseAccount,
                poolConfigState.leftoverReceiver,
                virtualPoolState.baseMint,
                tokenBaseProgram
            )

        if (createBaseTokenAccountIx) {
            preInstructions.push(createBaseTokenAccountIx)
        }

        const accounts = {
            poolAuthority,
            config: virtualPoolState.config,
            virtualPool: withdrawLeftoverParam.virtualPool,
            tokenBaseAccount,
            baseVault: virtualPoolState.baseVault,
            baseMint: virtualPoolState.baseMint,
            leftoverReceiver: poolConfigState.leftoverReceiver,
            tokenBaseProgram,
            eventAuthority,
            program: program.programId,
        }

        return program.methods
            .withdrawLeftover()
            .accounts(accounts)
            .preInstructions(preInstructions)
            .transaction()
    }
}
