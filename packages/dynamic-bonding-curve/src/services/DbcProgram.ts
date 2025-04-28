import {
    type MeteoraDammMigrationMetadata,
    type PoolConfig,
    type VirtualPool,
    type PartnerMetadata,
    type VirtualPoolMetadata,
    type LockEscrow,
} from '../types'
import {
    Commitment,
    Connection,
    PublicKey,
    TransactionInstruction,
} from '@solana/web3.js'
import {
    createDbcProgram,
    getAccountData,
    createProgramAccountFilter,
    derivePoolAuthority,
    getTokenProgram,
    getOrCreateATAInstruction,
} from '../helpers'
import type { Program, ProgramAccount } from '@coral-xyz/anchor'
import type { DynamicBondingCurve as DynamicBondingCurveIDL } from '../idl/dynamic-bonding-curve/idl'
import BN from 'bn.js'
import { getMint } from '@solana/spl-token'

export class DynamicBondingCurveProgram {
    protected program: Program<DynamicBondingCurveIDL>
    protected connection: Connection
    protected poolAuthority: PublicKey
    protected commitment: Commitment

    constructor(connection: Connection, commitment: Commitment) {
        const { program } = createDbcProgram(connection, commitment)
        this.program = program
        this.connection = connection
        this.poolAuthority = derivePoolAuthority(program.programId)
        this.commitment = commitment
    }

    protected async prepareTokenAccounts(
        owner: PublicKey,
        tokenAMint: PublicKey,
        tokenBMint: PublicKey,
        tokenAProgram: PublicKey,
        tokenBProgram: PublicKey
    ): Promise<{
        ataTokenA: PublicKey
        ataTokenB: PublicKey
        instructions: TransactionInstruction[]
    }> {
        const instructions: TransactionInstruction[] = []
        const [
            { ataPubkey: ataTokenA, ix: createAtaTokenAIx },
            { ataPubkey: ataTokenB, ix: createAtaTokenBIx },
        ] = await Promise.all([
            getOrCreateATAInstruction(
                this.connection,
                tokenAMint,
                owner,
                owner,
                true,
                tokenAProgram
            ),
            getOrCreateATAInstruction(
                this.connection,
                tokenBMint,
                owner,
                owner,
                true,
                tokenBProgram
            ),
        ])
        createAtaTokenAIx && instructions.push(createAtaTokenAIx)
        createAtaTokenBIx && instructions.push(createAtaTokenBIx)

        return { ataTokenA, ataTokenB, instructions }
    }

    /**
     * Get the underlying program instance
     * @returns The program instance
     */
    getProgram(): Program<DynamicBondingCurveIDL> {
        return this.program
    }

    /**
     * fetch virtual pool data
     * @param poolAddress - The address of the pool
     * @returns A virtual pool or null if not found
     */
    async fetchVirtualPoolState(
        poolAddress: PublicKey | string
    ): Promise<VirtualPool | null> {
        return getAccountData<VirtualPool>(
            poolAddress,
            'virtualPool',
            this.program
        )
    }

    /**
     * Fetch pool config data (partner config)
     * @param configAddress - The address of the pool config key
     * @returns A pool config
     */
    async fetchPoolConfigState(
        configAddress: PublicKey | string
    ): Promise<PoolConfig> {
        return getAccountData<PoolConfig>(
            configAddress,
            'poolConfig',
            this.program
        )
    }

    /**
     * Retrieves all virtual pools
     * @returns Array of pool accounts with their addresses
     */
    async getPools(): Promise<
        Array<{ publicKey: PublicKey; account: VirtualPool }>
    > {
        return await this.program.account.virtualPool.all()
    }

    /**
     * Retrieve all pool config keys (list of all configs owned by partner)
     * @param owner - The owner of the pool configs
     * @returns An array of pool configs
     */
    async getPoolConfigs(
        owner?: PublicKey | string
    ): Promise<Array<{ publicKey: PublicKey; account: PoolConfig }>> {
        const filters = owner ? createProgramAccountFilter(owner, 72) : []
        return await this.program.account.poolConfig.all(filters)
    }

    /**
     * Get pool migration quote threshold
     * @param poolAddress - The address of the pool
     * @returns The migration quote threshold
     */
    async getMigrationQuoteThreshold(
        poolAddress: PublicKey | string
    ): Promise<BN | null> {
        const poolState = await this.fetchVirtualPoolState(poolAddress)
        if (!poolState) {
            return null
        }
        const config = await this.fetchPoolConfigState(poolState.config)
        return config.migrationQuoteThreshold
    }

    /**
     * Get virtual pool metadata
     * @param virtualPoolAddress - The address of the virtual pool
     * @returns A virtual pool metadata
     */
    async getPoolMetadata(
        virtualPoolAddress: PublicKey | string
    ): Promise<Array<{ publicKey: PublicKey; account: VirtualPoolMetadata }>> {
        const filters = createProgramAccountFilter(virtualPoolAddress, 8)
        return await this.program.account.virtualPoolMetadata.all(filters)
    }

    /**
     * Get partner metadata
     * @param partnerAddress - The address of the partner
     * @returns A partner metadata
     */
    async getPartnerMetadata(
        partnerAddress: PublicKey | string
    ): Promise<Array<{ publicKey: PublicKey; account: PartnerMetadata }>> {
        const filters = createProgramAccountFilter(partnerAddress, 8)
        return await this.program.account.partnerMetadata.all(filters)
    }

    /**
     * Get DAMM V1 migration metadata
     * @param poolAddress - The address of the meteora DAMM migration metadata
     * @returns A meteora DAMM migration metadata
     */
    async getDammV1MigrationMetadata(
        poolAddress: PublicKey | string
    ): Promise<MeteoraDammMigrationMetadata | null> {
        const metadata =
            await this.program.account.meteoraDammMigrationMetadata.fetchNullable(
                poolAddress instanceof PublicKey
                    ? poolAddress
                    : new PublicKey(poolAddress)
            )

        return metadata
    }

    /**
     * Get DAMM V1 migration metadata
     * @param walletAddress - The address of the meteora DAMM migration metadata
     * @returns A meteora DAMM migration metadata
     */
    async getLockedLpTokenMetadata(
        walletAddress: PublicKey | string
    ): Promise<LockEscrow | null> {
        const metadata = await this.program.account.lockEscrow.fetchNullable(
            walletAddress instanceof PublicKey
                ? walletAddress
                : new PublicKey(walletAddress)
        )

        return metadata
    }

    /**
     * Get the progress of the curve by comparing current quote reserve to migration threshold
     * @param poolAddress - The address of the pool
     * @returns The progress as a ratio between 0 and 1
     */
    async getCurveProgress(poolAddress: PublicKey | string): Promise<number> {
        const poolState = await this.fetchVirtualPoolState(poolAddress)
        if (!poolState) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }

        const config = await this.fetchPoolConfigState(poolState.config)
        const quoteReserve = poolState.quoteReserve
        const migrationThreshold = config.migrationQuoteThreshold

        // Convert BN to number for calculation
        const quoteReserveNum = quoteReserve.toNumber()
        const thresholdNum = migrationThreshold.toNumber()

        // Calculate progress as a ratio
        const progress = quoteReserveNum / thresholdNum

        // Ensure progress is between 0 and 1
        return Math.min(Math.max(progress, 0), 1)
    }
}
