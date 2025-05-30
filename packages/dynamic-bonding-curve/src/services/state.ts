import { Commitment, Connection, PublicKey } from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    createProgramAccountFilter,
    deriveDammV1MigrationMetadataAddress,
    deriveDammV2MigrationMetadataAddress,
    getAccountData,
} from '../helpers'
import {
    LockEscrow,
    MeteoraDammMigrationMetadata,
    MeteoraDammV2MigrationMetadata,
    PartnerMetadata,
    PoolConfig,
    VirtualPool,
    VirtualPoolMetadata,
} from '../types'
import { ProgramAccount } from '@coral-xyz/anchor'
import BN from 'bn.js'

export class StateService extends DynamicBondingCurveProgram {
    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
    }

    /**
     * Get pool config data (partner config)
     * @param configAddress - The address of the pool config key
     * @returns A pool config
     */
    async getPoolConfig(
        configAddress: PublicKey | string
    ): Promise<PoolConfig> {
        return getAccountData<PoolConfig>(
            configAddress,
            'poolConfig',
            this.program
        )
    }

    /**
     * Get all config keys
     * @returns An array of config key accounts
     */
    async getPoolConfigs(): Promise<ProgramAccount<PoolConfig>[]> {
        return this.program.account.poolConfig.all()
    }

    /**
     * Get all config keys of an owner wallet address
     * @param owner - The owner of the config keys
     * @returns An array of config key accounts
     */
    async getPoolConfigsByOwner(
        owner: PublicKey | string
    ): Promise<ProgramAccount<PoolConfig>[]> {
        const filters = createProgramAccountFilter(owner, 72)
        return this.program.account.poolConfig.all(filters)
    }

    /**
     * Get virtual pool data
     * @param poolAddress - The address of the pool
     * @returns A virtual pool or null if not found
     */
    async getPool(poolAddress: PublicKey | string): Promise<VirtualPool> {
        return getAccountData<VirtualPool>(
            poolAddress,
            'virtualPool',
            this.program
        )
    }

    /**
     * Get all dynamic bonding curve pools
     * @returns Array of pool accounts with their addresses
     */
    async getPools(): Promise<ProgramAccount<VirtualPool>[]> {
        return this.program.account.virtualPool.all()
    }

    /**
     * Get all dynamic bonding curve pools by config key address
     * @param configAddress - The address of the config key
     * @returns Array of pool accounts with their addresses
     */
    async getPoolsByConfig(
        configAddress: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool>[]> {
        const filters = createProgramAccountFilter(configAddress, 72)
        return this.program.account.virtualPool.all(filters)
    }

    /**
     * Get pool by base mint
     * @param baseMint - The base mint address
     * @returns A virtual pool account
     */
    async getPoolByBaseMint(
        baseMint: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool> | null> {
        const filters = createProgramAccountFilter(baseMint, 136)
        const pools = await this.program.account.virtualPool.all(filters)
        return pools.length > 0 ? pools[0] : null
    }

    /**
     * Get pool migration quote threshold
     * @param poolAddress - The address of the pool
     * @returns The migration quote threshold
     */
    async getPoolMigrationQuoteThreshold(
        poolAddress: PublicKey | string
    ): Promise<BN> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }
        const configAddress = pool.config
        const config = await this.getPoolConfig(configAddress)
        return config.migrationQuoteThreshold
    }

    /**
     * Get the progress of the curve by comparing current quote reserve to migration threshold
     * @param poolAddress - The address of the pool
     * @returns The progress as a ratio between 0 and 1
     */
    async getPoolCurveProgress(
        poolAddress: PublicKey | string
    ): Promise<number> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }

        const config = await this.getPoolConfig(pool.config)
        const quoteReserve = pool.quoteReserve
        const migrationThreshold = config.migrationQuoteThreshold

        const quoteReserveNum = quoteReserve.toNumber()
        const thresholdNum = migrationThreshold.toNumber()

        const progress = quoteReserveNum / thresholdNum

        return Math.min(Math.max(progress, 0), 1)
    }

    /**
     * Get pool metadata
     * @param poolAddress - The address of the pool
     * @returns A pool metadata
     */
    async getPoolMetadata(
        poolAddress: PublicKey | string
    ): Promise<VirtualPoolMetadata[]> {
        const filters = createProgramAccountFilter(poolAddress, 8)
        const accounts =
            await this.program.account.virtualPoolMetadata.all(filters)
        return accounts.map((account) => account.account)
    }

    /**
     * Get partner metadata
     * @param partnerAddress - The address of the partner
     * @returns A partner metadata
     */
    async getPartnerMetadata(
        walletAddress: PublicKey | string
    ): Promise<PartnerMetadata[]> {
        const filters = createProgramAccountFilter(walletAddress, 8)
        const accounts = await this.program.account.partnerMetadata.all(filters)
        return accounts.map((account) => account.account)
    }

    /**
     * Get DAMM V1 lock escrow details
     * @param lockEscrowAddress - The address of the lock escrow
     * @returns A lock escrow account
     */
    async getDammV1LockEscrow(
        lockEscrowAddress: PublicKey | string
    ): Promise<LockEscrow | null> {
        const metadata = await this.program.account.lockEscrow.fetchNullable(
            lockEscrowAddress instanceof PublicKey
                ? lockEscrowAddress
                : new PublicKey(lockEscrowAddress)
        )

        return metadata
    }

    /**
     * Get DAMM V1 migration metadata
     * @param poolAddress - The address of the DAMM V1 pool (on DBC)
     * @returns A DAMM V1 migration metadata
     */
    async getDammV1MigrationMetadata(
        poolAddress: PublicKey
    ): Promise<MeteoraDammMigrationMetadata> {
        const migrationMetadataAddress =
            deriveDammV1MigrationMetadataAddress(poolAddress)
        const metadata =
            await this.program.account.meteoraDammMigrationMetadata.fetch(
                migrationMetadataAddress
            )

        return metadata
    }

    /**
     * Get DAMM V2 migration metadata
     * @param poolAddress - The address of the DAMM V2 pool (on DBC)
     * @returns A DAMM V2 migration metadata
     */
    async getDammV2MigrationMetadata(
        poolAddress: PublicKey
    ): Promise<MeteoraDammV2MigrationMetadata> {
        const migrationMetadataAddress =
            deriveDammV2MigrationMetadataAddress(poolAddress)
        const metadata = await this.program.account.meteoraDammV2Metadata.fetch(
            migrationMetadataAddress
        )

        return metadata
    }

    /**
     * Get fee metrics for a specific pool
     * @param poolAddress - The address of the pool
     * @returns Object containing current and total fee metrics
     */
    async getPoolFeeMetrics(poolAddress: PublicKey | string): Promise<{
        current: {
            partnerBaseFee: BN
            partnerQuoteFee: BN
            creatorBaseFee: BN
            creatorQuoteFee: BN
        }
        total: {
            totalTradingBaseFee: BN
            totalTradingQuoteFee: BN
        }
    }> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }

        return {
            current: {
                partnerBaseFee: pool.partnerBaseFee,
                partnerQuoteFee: pool.partnerQuoteFee,
                creatorBaseFee: pool.creatorBaseFee,
                creatorQuoteFee: pool.creatorQuoteFee,
            },
            total: {
                totalTradingBaseFee: pool.metrics.totalTradingBaseFee,
                totalTradingQuoteFee: pool.metrics.totalTradingQuoteFee,
            },
        }
    }

    /**
     * Get fee metrics for a specific pool
     * @param poolAddress - The address of the pool
     * @returns Object containing current and total fee metrics
     */
    async getPoolCreatorFeeMetrics(poolAddress: PublicKey | string): Promise<{
        creatorBaseFee: BN
        creatorQuoteFee: BN
    }> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }

        return {
            creatorBaseFee: pool.creatorBaseFee,
            creatorQuoteFee: pool.creatorQuoteFee,
        }
    }

    /**
     * Get fee metrics for a specific pool
     * @param poolAddress - The address of the pool
     * @returns Object containing current and total fee metrics
     */
    async getPoolPartnerFeeMetrics(poolAddress: PublicKey | string): Promise<{
        partnerBaseFee: BN
        partnerQuoteFee: BN
    }> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }

        return {
            partnerBaseFee: pool.partnerBaseFee,
            partnerQuoteFee: pool.partnerQuoteFee,
        }
    }

    /**
     * Get all quote fees for pools linked to a specific config key
     * @param configAddress - The address of the pool config
     * @returns Array of pools with their quote fees
     */
    async getPoolsQuoteFeesByConfig(configAddress: PublicKey | string): Promise<
        Array<{
            poolAddress: PublicKey
            partnerQuoteFee: BN
            creatorQuoteFee: BN
            totalTradingQuoteFee: BN
        }>
    > {
        const filteredPools = await this.getPoolsByConfig(configAddress)

        return filteredPools.map((pool) => ({
            poolAddress: pool.publicKey,
            partnerQuoteFee: pool.account.partnerQuoteFee,
            creatorQuoteFee: pool.account.creatorQuoteFee,
            totalTradingQuoteFee: pool.account.metrics.totalTradingQuoteFee,
        }))
    }

    /**
     * Get all base fees for pools linked to a specific config key
     * @param configAddress - The address of the pool config
     * @returns Array of pools with their base fees
     */
    async getPoolsBaseFeesByConfig(configAddress: PublicKey | string): Promise<
        Array<{
            poolAddress: PublicKey
            partnerBaseFee: BN
            creatorBaseFee: BN
            totalTradingBaseFee: BN
        }>
    > {
        const filteredPools = await this.getPoolsByConfig(configAddress)

        return filteredPools.map((pool) => ({
            poolAddress: pool.publicKey,
            partnerBaseFee: pool.account.partnerBaseFee,
            creatorBaseFee: pool.account.creatorBaseFee,
            totalTradingBaseFee: pool.account.metrics.totalTradingBaseFee,
        }))
    }
}
