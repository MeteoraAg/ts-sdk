import { Commitment, Connection } from '@solana/web3.js'
import { PoolService, MigrationService, PartnerService } from './services'

/**
 * Main client class
 */
export class DynamicBondingCurveClient {
    public pools: PoolService
    public partners: PartnerService
    public migrations: MigrationService
    public commitment: Commitment
    public connection: Connection

    constructor(connection: Connection, commitment: Commitment) {
        this.pools = new PoolService(connection, commitment)
        this.partners = new PartnerService(connection, commitment)
        this.migrations = new MigrationService(connection, commitment)
        this.commitment = commitment
        this.connection = connection
    }

    /**
     * Static method to create a client instance for a specific pool
     * @param connection - The connection to the Solana network
     * @returns A DynamicBondingCurveClient instance
     */
    static create(
        connection: Connection,
        commitment: Commitment = 'confirmed'
    ): DynamicBondingCurveClient {
        return new DynamicBondingCurveClient(connection, commitment)
    }
}
