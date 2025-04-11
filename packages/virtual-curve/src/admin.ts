import {
    TokenType,
    type ClaimProtocolFeeParam,
    type CloseClaimFeeOperatorParam,
    type CreateClaimFeeOperatorParam,
    type PoolConfigState,
    type ProtocolWithdrawSurplusParam,
    type VirtualCurveAdminInterface,
    type VirtualPoolState,
} from './types'
import type { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { VirtualCurve } from '.'
import { createProgram, findAssociatedTokenAddress } from './utils'
import {
    deriveClaimFeeOperatorAddress,
    deriveEventAuthority,
    derivePoolAuthority,
} from './derive'
import type { Program } from '@coral-xyz/anchor'
import type { VirtualCurve as VirtualCurveIDL } from './idl/idl'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'

export class VirtualCurveAdmin
    extends VirtualCurve
    implements VirtualCurveAdminInterface
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
     * Create a VirtualCurveAdmin instance
     * @param connection - The connection to the Solana network
     * @param pool - The pool address
     * @returns A VirtualCurveAdmin instance
     */
    static async create(
        connection: Connection,
        pool: PublicKey
    ): Promise<VirtualCurveAdmin> {
        const { program } = await createProgram(connection)
        const virtualPoolState = await program.account.virtualPool.fetch(pool)
        const poolConfigState = await program.account.poolConfig.fetch(
            virtualPoolState.config
        )

        return new VirtualCurveAdmin(
            program,
            pool,
            virtualPoolState,
            poolConfigState
        )
    }

    /////////////////////
    // ADMIN FUNCTIONS //
    /////////////////////

    /**
     * Claim protocol fee
     * @param claimProtocolFeeParam - The parameters for the claim protocol fee
     * @returns A claim protocol fee transaction
     */
    async claimProtocolFee(
        claimProtocolFeeParam: ClaimProtocolFeeParam
    ): Promise<Transaction> {
        const eventAuthority = deriveEventAuthority(this.program.programId)
        const poolAuthority = derivePoolAuthority(this.program.programId)

        const tokenBaseAccount = findAssociatedTokenAddress(
            claimProtocolFeeParam.operator,
            this.virtualPoolState.baseMint,
            this.virtualPoolState.poolType === TokenType.SPL
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID
        )

        const tokenQuoteAccount = findAssociatedTokenAddress(
            claimProtocolFeeParam.operator,
            this.poolConfigState.quoteMint,
            this.poolConfigState.quoteTokenFlag === TokenType.SPL
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID
        )

        const claimFeeOperator = deriveClaimFeeOperatorAddress(
            claimProtocolFeeParam.operator,
            this.program.programId
        )
        const accounts = {
            poolAuthority,
            config: this.virtualPoolState.config,
            pool: claimProtocolFeeParam.pool,
            baseVault: this.virtualPoolState.baseVault,
            quoteVault: this.virtualPoolState.quoteVault,
            baseMint: this.virtualPoolState.baseMint,
            quoteMint: this.poolConfigState.quoteMint,
            tokenBaseAccount,
            tokenQuoteAccount,
            claimFeeOperator,
            operator: claimProtocolFeeParam.operator,
            eventAuthority,
            tokenBaseProgram:
                this.virtualPoolState.poolType === TokenType.SPL
                    ? TOKEN_PROGRAM_ID
                    : TOKEN_2022_PROGRAM_ID,
            tokenQuoteProgram:
                this.poolConfigState.quoteTokenFlag === TokenType.SPL
                    ? TOKEN_PROGRAM_ID
                    : TOKEN_2022_PROGRAM_ID,
            program: this.program.programId,
        }

        return this.program.methods
            .claimProtocolFee()
            .accounts(accounts)
            .transaction()
    }

    /**
     * Close a claim fee operator
     * @param connection - The connection to the Solana network
     * @param params - The parameters for the claim fee operator
     * @returns A transaction
     */
    static async closeClaimFeeOperator(
        connection: Connection,
        params: CloseClaimFeeOperatorParam
    ): Promise<Transaction> {
        const { program } = createProgram(connection)
        const eventAuthority = deriveEventAuthority(program.programId)
        const accounts = {
            ...params,
            eventAuthority,
            program: program.programId,
        }

        return program.methods
            .closeClaimFeeOperator()
            .accounts(accounts)
            .transaction()
    }

    /**
     * Create a claim fee operator
     * @param connection - The connection to the Solana network
     * @param createClaimFeeOperatorParam - The parameters for the claim fee operator
     * @returns A transaction
     */
    static async createClaimFeeOperator(
        connection: Connection,
        createClaimFeeOperatorParam: CreateClaimFeeOperatorParam
    ): Promise<Transaction> {
        const { program } = createProgram(connection)
        const eventAuthority = deriveEventAuthority(program.programId)
        const accounts = {
            ...createClaimFeeOperatorParam,
            eventAuthority,
            program: program.programId,
        }

        return program.methods
            .createClaimFeeOperator()
            .accounts(accounts)
            .transaction()
    }

    /**
     * Protocol withdraw surplus
     * @param params - The parameters for the protocol withdraw surplus
     * @returns A transaction
     */
    async protocolWithdrawSurplus(
        protocolWithdrawSurplusParam: ProtocolWithdrawSurplusParam
    ): Promise<Transaction> {
        const poolAuthority = derivePoolAuthority(this.program.programId)
        const eventAuthority = deriveEventAuthority(this.program.programId)

        const tokenQuoteAccount = findAssociatedTokenAddress(
            protocolWithdrawSurplusParam.operator,
            this.poolConfigState.quoteMint,
            this.poolConfigState.quoteTokenFlag === TokenType.SPL
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID
        )

        const accounts = {
            poolAuthority,
            config: this.virtualPoolState.config,
            virtualPool: protocolWithdrawSurplusParam.virtualPool,
            tokenQuoteAccount,
            quoteVault: this.virtualPoolState.quoteVault,
            quoteMint: this.poolConfigState.quoteMint,
            tokenQuoteProgram:
                this.poolConfigState.quoteTokenFlag === TokenType.SPL
                    ? TOKEN_PROGRAM_ID
                    : TOKEN_2022_PROGRAM_ID,
            eventAuthority,
            program: this.program.programId,
        }

        return this.program.methods
            .protocolWithdrawSurplus()
            .accounts(accounts)
            .transaction()
    }
}
