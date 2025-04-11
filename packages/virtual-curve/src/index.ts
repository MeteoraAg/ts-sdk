import { Program, type ProgramAccount } from '@coral-xyz/anchor'
import {
    type ClaimFeeOperator,
    type Config,
    type PoolConfigState,
    type VirtualCurveProgram,
    type VirtualPoolState,
} from './types'
import type { VirtualCurve as VirtualCurveIDL } from './idl/idl'
import {
    Connection,
    PublicKey,
    type GetProgramAccountsFilter,
} from '@solana/web3.js'
import { createProgram } from './utils'

export class VirtualCurve {
    protected program: VirtualCurveProgram

    constructor(program: Program<VirtualCurveIDL>) {
        this.program = program
    }

    /**
     * Get virtual pool
     * @param connection - The connection to the Solana network
     * @param poolAddress - The address of the pool
     * @returns A virtual pool
     */
    static async getPool(
        connection: Connection,
        poolAddress: PublicKey | string
    ): Promise<VirtualPoolState> {
        const { program } = createProgram(connection)
        const pool = await program.account.virtualPool.fetch(
            poolAddress instanceof PublicKey
                ? poolAddress
                : new PublicKey(poolAddress)
        )

        return pool
    }

    /**
     * Retrieves pools with optional filtering by owner
     * @param owner - Optional PublicKey or string to filter pools by owner
     * @returns Array of pool accounts with their addresses
     */
    async getPools(
        connection: Connection,
        owner?: PublicKey | string
    ): Promise<ProgramAccount<VirtualPoolState>[]> {
        const { program } = createProgram(connection)
        const filters: GetProgramAccountsFilter[] = []

        if (owner) {
            const ownerKey =
                typeof owner === 'string' ? new PublicKey(owner) : owner
            filters.push({
                memcmp: {
                    offset: 292, // Correct offset for the owner field after the discriminator and other fields
                    bytes: ownerKey.toBase58(),
                    encoding: 'base58',
                },
            })
        }

        return await program.account.virtualPool.all(filters)
    }

    /**
     * Get config
     * @param connection - The connection to the Solana network
     * @param configAddress - The address of the config
     * @returns A config
     */
    static async getConfig(
        connection: Connection,
        configAddress: PublicKey | string
    ): Promise<Config> {
        const { program } = createProgram(connection)
        const config = await program.account.config.fetch(
            configAddress instanceof PublicKey
                ? configAddress
                : new PublicKey(configAddress)
        )

        return config
    }

    /**
     * Get pool config
     * @param connection - The connection to the Solana network
     * @param poolConfigAddress - The address of the pool config
     * @returns A pool config
     */
    static async getPoolConfig(
        connection: Connection,
        poolConfigAddress: PublicKey | string
    ): Promise<PoolConfigState> {
        const { program } = createProgram(connection)
        const poolConfig = await program.account.poolConfig.fetch(
            poolConfigAddress instanceof PublicKey
                ? poolConfigAddress
                : new PublicKey(poolConfigAddress)
        )
        return poolConfig
    }

    /**
     * Retrieve all pool configs
     * @param connection - The connection to the Solana network
     * @param owner - The owner of the pool configs
     * @returns An array of pool configs
     */
    static async getPoolConfigs(
        connection: Connection,
        owner?: PublicKey | string
    ): Promise<ProgramAccount<PoolConfigState>[]> {
        const { program } = createProgram(connection)
        const filters: GetProgramAccountsFilter[] = []

        if (owner) {
            const ownerKey =
                typeof owner === 'string' ? new PublicKey(owner) : owner
            filters.push({
                memcmp: {
                    offset: 72,
                    bytes: ownerKey.toBase58(),
                    encoding: 'base58',
                },
            })
        }

        return await program.account.poolConfig.all(filters)
    }

    /**
     * Get claim fee operator
     * @param connection - The connection to the Solana network
     * @param operatorAddress - The address of the claim fee operator
     * @returns A claim fee operator
     */
    static async getClaimFeeOperator(
        connection: Connection,
        operatorAddress: PublicKey | string
    ): Promise<ClaimFeeOperator> {
        const { program } = createProgram(connection)
        const feeOperator = await program.account.claimFeeOperator.fetch(
            operatorAddress instanceof PublicKey
                ? operatorAddress
                : new PublicKey(operatorAddress)
        )

        return feeOperator
    }
}
