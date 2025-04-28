import {
    Commitment,
    ComputeBudgetProgram,
    Keypair,
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
    type Connection,
    type Transaction,
} from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './DbcProgram'
import type { DynamicVault } from '../idl/dynamic-vault/idl'
import type { Program } from '@coral-xyz/anchor'
import {
    createDammV1Program,
    createVaultProgram,
    findAssociatedTokenAddress,
    deriveBaseKeyForLocker,
    deriveDammMigrationMetadataAddress,
    deriveDammPoolAddress,
    deriveDammV2EventAuthority,
    deriveDammV2PoolAddress,
    deriveEscrow,
    deriveLockEscrowAddress,
    deriveLpMintAddress,
    deriveMetadata,
    derivePoolAuthority,
    derivePositionAddress,
    derivePositionNftAccount,
    deriveProtocolFeeAddress,
    deriveTokenVaultAddress,
    deriveVaultLPAddress,
    deriveVaultPdas,
    createInitializePermissionlessDynamicVaultIx,
    createLockEscrowIx,
    getTokenProgram,
} from '../helpers'
import type { DammV1 } from '../idl/damm-v1/idl'
import type {
    CreateDammMigrationMetadataParam,
    CreateLockerParam,
    DammLpTokenParam,
    MigrateToDammV1Param,
    MigrateToDammV2Param,
    MigrateToDammV2Response,
} from '../types'
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    getAssociatedTokenAddressSync,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
    DAMM_V1_PROGRAM_ID,
    DAMM_V2_PROGRAM_ID,
    DYNAMIC_BONDING_CURVE_PROGRAM_ID,
    LOCKER_PROGRAM_ID,
    METAPLEX_PROGRAM_ID,
    VAULT_PROGRAM_ID,
} from '../constants'

export class MigrationService extends DynamicBondingCurveProgram {
    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
    }

    /**
     * Get the vault program instance
     * @returns The vault program instance
     */
    private getVaultProgram(): Program<DynamicVault> {
        return createVaultProgram(this.connection)
    }

    /**
     * Get the DAMM V1 program instance
     * @returns The DAMM V1 program instance
     */
    private getDammV1Program(): Program<DammV1> {
        return createDammV1Program(this.connection)
    }

    /**
     * Create metadata for the migration of Meteora DAMM V1 or DAMM V2
     * @param createDammMigrationMetadataParam - The parameters for the migration
     * @returns A migration transaction
     */
    async createDammMigrationMetadata(
        createDammMigrationMetadataParam: CreateDammMigrationMetadataParam
    ): Promise<Transaction> {
        const migrationMetadata = deriveDammMigrationMetadataAddress(
            createDammMigrationMetadataParam.virtualPool,
            this.program.programId,
            createDammMigrationMetadataParam.migrateToDammV2
        )

        const accounts = {
            virtualPool: createDammMigrationMetadataParam.virtualPool,
            config: createDammMigrationMetadataParam.config,
            migrationMetadata: migrationMetadata,
            payer: createDammMigrationMetadataParam.payer,
            systemProgram: SystemProgram.programId,
        }

        if (createDammMigrationMetadataParam.migrateToDammV2) {
            return this.program.methods
                .migrationDammV2CreateMetadata()
                .accountsPartial(accounts)
                .transaction()
        } else {
            return this.program.methods
                .migrationMeteoraDammCreateMetadata()
                .accountsPartial(accounts)
                .transaction()
        }
    }

    /**
     * Create a locker
     * @param createLockerParam - The parameters for the locker
     * @returns A create locker transaction
     */
    async createLocker(
        createLockerParam: CreateLockerParam
    ): Promise<Transaction> {
        const virtualPoolState = await this.fetchVirtualPoolState(
            createLockerParam.virtualPool
        )

        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${createLockerParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.fetchPoolConfigState(
            virtualPoolState.config
        )

        const base = deriveBaseKeyForLocker(createLockerParam.virtualPool)

        const escrow = deriveEscrow(base)

        const tokenProgram = getTokenProgram(poolConfigState.tokenType)

        const escrowToken = findAssociatedTokenAddress(
            escrow,
            virtualPoolState.baseMint,
            tokenProgram
        )

        const preInstructions: TransactionInstruction[] = []

        const createOwnerEscrowVaultTokenXIx =
            createAssociatedTokenAccountIdempotentInstruction(
                createLockerParam.payer,
                escrowToken,
                escrow,
                virtualPoolState.baseMint,
                tokenProgram
            )

        preInstructions.push(createOwnerEscrowVaultTokenXIx)

        return this.program.methods
            .createLocker()
            .accountsPartial({
                virtualPool: createLockerParam.virtualPool,
                config: virtualPoolState.config,
                poolAuthority: this.poolAuthority,
                baseVault: virtualPoolState.baseVault,
                baseMint: virtualPoolState.baseMint,
                base,
                creator: virtualPoolState.creator,
                escrow,
                escrowToken,
                payer: createLockerParam.payer,
                tokenProgram,
                lockerProgram: LOCKER_PROGRAM_ID,
            })
            .preInstructions(preInstructions)
            .transaction()
    }

    ///////////////////////
    // DAMM V1 FUNCTIONS //
    ///////////////////////

    /**
     * Migrate to DAMM V1
     * @param migrateToDammV1Param - The parameters for the migration
     * @returns A migrate transaction
     */
    async migrateToDammV1(
        migrateToDammV1Param: MigrateToDammV1Param
    ): Promise<Transaction> {
        const virtualPoolState = await this.fetchVirtualPoolState(
            migrateToDammV1Param.virtualPool
        )
        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${migrateToDammV1Param.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.fetchPoolConfigState(
            virtualPoolState.config
        )

        const migrationMetadata = deriveDammMigrationMetadataAddress(
            migrateToDammV1Param.virtualPool,
            this.program.programId,
            false
        )

        const dammPool = deriveDammPoolAddress(
            migrateToDammV1Param.dammConfig,
            virtualPoolState.baseMint,
            poolConfigState.quoteMint
        )

        const lpMint = deriveLpMintAddress(dammPool, DAMM_V1_PROGRAM_ID)

        const mintMetadata = deriveMetadata(lpMint)

        const [protocolTokenAFee, protocolTokenBFee] = [
            deriveProtocolFeeAddress(
                virtualPoolState.baseMint,
                dammPool,
                DAMM_V1_PROGRAM_ID
            ),
            deriveProtocolFeeAddress(
                poolConfigState.quoteMint,
                dammPool,
                DAMM_V1_PROGRAM_ID
            ),
        ]

        const vaultProgram = this.getVaultProgram()

        const [
            {
                vaultPda: aVault,
                tokenVaultPda: aTokenVault,
                lpMintPda: aLpMintPda,
            },
            {
                vaultPda: bVault,
                tokenVaultPda: bTokenVault,
                lpMintPda: bLpMintPda,
            },
        ] = [
            deriveVaultPdas(virtualPoolState.baseMint, vaultProgram.programId),
            deriveVaultPdas(poolConfigState.quoteMint, vaultProgram.programId),
        ]

        const [aVaultAccount, bVaultAccount] = await Promise.all([
            vaultProgram.account.vault.fetchNullable(aVault),
            vaultProgram.account.vault.fetchNullable(bVault),
        ])

        let aVaultLpMint = aLpMintPda
        let bVaultLpMint = bLpMintPda
        const preInstructions: TransactionInstruction[] = []

        if (!aVaultAccount) {
            const createVaultAIx =
                await createInitializePermissionlessDynamicVaultIx(
                    virtualPoolState.baseMint,
                    migrateToDammV1Param.payer,
                    vaultProgram
                )
            if (createVaultAIx) {
                preInstructions.push(createVaultAIx.instruction)
            }
        } else {
            aVaultLpMint = aVaultAccount.lpMint
        }
        if (!bVaultAccount) {
            const createVaultBIx =
                await createInitializePermissionlessDynamicVaultIx(
                    poolConfigState.quoteMint,
                    migrateToDammV1Param.payer,
                    vaultProgram
                )
            if (createVaultBIx) {
                preInstructions.push(createVaultBIx.instruction)
            }
        } else {
            bVaultLpMint = bVaultAccount.lpMint
        }

        const [aVaultLp, bVaultLp] = [
            deriveVaultLPAddress(aVault, dammPool, DAMM_V1_PROGRAM_ID),
            deriveVaultLPAddress(bVault, dammPool, DAMM_V1_PROGRAM_ID),
        ]

        const virtualPoolLp = getAssociatedTokenAddressSync(
            lpMint,
            this.poolAuthority,
            true,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        )

        const transaction = await this.program.methods
            .migrateMeteoraDamm()
            .accountsPartial({
                virtualPool: migrateToDammV1Param.virtualPool,
                migrationMetadata,
                config: virtualPoolState.config,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                dammConfig: migrateToDammV1Param.dammConfig,
                lpMint,
                tokenAMint: virtualPoolState.baseMint,
                tokenBMint: poolConfigState.quoteMint,
                aVault,
                bVault,
                aTokenVault,
                bTokenVault,
                aVaultLpMint,
                bVaultLpMint,
                aVaultLp,
                bVaultLp,
                baseVault: virtualPoolState.baseVault,
                quoteVault: virtualPoolState.quoteVault,
                virtualPoolLp,
                protocolTokenAFee,
                protocolTokenBFee,
                payer: migrateToDammV1Param.payer,
                rent: SYSVAR_RENT_PUBKEY,
                mintMetadata,
                metadataProgram: METAPLEX_PROGRAM_ID,
                ammProgram: DAMM_V1_PROGRAM_ID,
                vaultProgram: VAULT_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .preInstructions(preInstructions)
            .transaction()

        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 500000,
        })

        transaction.add(modifyComputeUnits)

        return transaction
    }

    /**
     * Lock DAMM V1 LP token for creator or partner
     * @param lockDammV1LpTokenParam - The parameters for the lock
     * @returns A lock transaction
     */
    async lockDammV1LpToken(
        lockDammV1LpTokenParam: DammLpTokenParam
    ): Promise<Transaction> {
        const virtualPoolState = await this.fetchVirtualPoolState(
            lockDammV1LpTokenParam.virtualPool
        )

        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${lockDammV1LpTokenParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.fetchPoolConfigState(
            virtualPoolState.config
        )

        const dammPool = deriveDammPoolAddress(
            lockDammV1LpTokenParam.dammConfig,
            virtualPoolState.baseMint,
            poolConfigState.quoteMint
        )

        const migrationMetadata = deriveDammMigrationMetadataAddress(
            lockDammV1LpTokenParam.virtualPool,
            DYNAMIC_BONDING_CURVE_PROGRAM_ID,
            false
        )

        const vaultProgram = this.getVaultProgram()

        const [
            { vaultPda: aVault, lpMintPda: aLpMintPda },
            { vaultPda: bVault, lpMintPda: bLpMintPda },
        ] = [
            deriveVaultPdas(virtualPoolState.baseMint, vaultProgram.programId),
            deriveVaultPdas(poolConfigState.quoteMint, vaultProgram.programId),
        ]

        const [aVaultAccount, bVaultAccount] = await Promise.all([
            vaultProgram.account.vault.fetchNullable(aVault),
            vaultProgram.account.vault.fetchNullable(bVault),
        ])

        let aVaultLpMint = aLpMintPda
        let bVaultLpMint = bLpMintPda
        const preInstructions: TransactionInstruction[] = []

        if (!aVaultAccount) {
            const createVaultAIx =
                await createInitializePermissionlessDynamicVaultIx(
                    virtualPoolState.baseMint,
                    lockDammV1LpTokenParam.payer,
                    vaultProgram
                )
            if (createVaultAIx) {
                preInstructions.push(createVaultAIx.instruction)
            }
        } else {
            aVaultLpMint = aVaultAccount.lpMint
        }
        if (!bVaultAccount) {
            const createVaultBIx =
                await createInitializePermissionlessDynamicVaultIx(
                    poolConfigState.quoteMint,
                    lockDammV1LpTokenParam.payer,
                    vaultProgram
                )
            if (createVaultBIx) {
                preInstructions.push(createVaultBIx.instruction)
            }
        } else {
            bVaultLpMint = bVaultAccount.lpMint
        }

        const [aVaultLp, bVaultLp] = [
            deriveVaultLPAddress(aVault, dammPool, DAMM_V1_PROGRAM_ID),
            deriveVaultLPAddress(bVault, dammPool, DAMM_V1_PROGRAM_ID),
        ]

        const lpMint = deriveLpMintAddress(dammPool, DAMM_V1_PROGRAM_ID)

        const dammV1Program = this.getDammV1Program()

        const dammV1MigrationMetadata =
            await this.getDammV1MigrationMetadata(migrationMetadata)

        let lockEscrowKey: PublicKey

        if (lockDammV1LpTokenParam.isPartner) {
            lockEscrowKey = deriveLockEscrowAddress(
                dammPool,
                dammV1MigrationMetadata.partner,
                DAMM_V1_PROGRAM_ID
            )

            const lockEscrowData =
                await this.connection.getAccountInfo(lockEscrowKey)

            if (!lockEscrowData) {
                const ix = await createLockEscrowIx(
                    lockDammV1LpTokenParam.payer,
                    dammPool,
                    lpMint,
                    dammV1MigrationMetadata.partner,
                    lockEscrowKey,
                    dammV1Program
                )
                preInstructions.push(ix)
            }
        } else {
            lockEscrowKey = deriveLockEscrowAddress(
                dammPool,
                virtualPoolState.creator,
                DAMM_V1_PROGRAM_ID
            )

            const lockEscrowData =
                await this.connection.getAccountInfo(lockEscrowKey)

            if (!lockEscrowData) {
                const ix = await createLockEscrowIx(
                    lockDammV1LpTokenParam.payer,
                    dammPool,
                    lpMint,
                    virtualPoolState.creator,
                    lockEscrowKey,
                    dammV1Program
                )
                preInstructions.push(ix)
            }
        }

        const escrowVault = getAssociatedTokenAddressSync(
            lpMint,
            lockEscrowKey,
            true,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        )

        const createEscrowVaultIx =
            createAssociatedTokenAccountIdempotentInstruction(
                lockDammV1LpTokenParam.payer,
                escrowVault,
                lockEscrowKey,
                lpMint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            )

        preInstructions.push(createEscrowVaultIx)

        const sourceTokens = getAssociatedTokenAddressSync(
            lpMint,
            this.poolAuthority,
            true
        )

        return this.program.methods
            .migrateMeteoraDammLockLpToken()
            .accountsPartial({
                virtualPool: lockDammV1LpTokenParam.virtualPool,
                migrationMetadata,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                lpMint,
                lockEscrow: lockEscrowKey,
                owner: lockDammV1LpTokenParam.isPartner
                    ? dammV1MigrationMetadata.partner
                    : virtualPoolState.creator,
                sourceTokens,
                escrowVault,
                aVault,
                bVault,
                aVaultLp,
                bVaultLp,
                aVaultLpMint,
                bVaultLpMint,
                ammProgram: DAMM_V1_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .preInstructions(preInstructions)
            .transaction()
    }

    /**
     * Claim DAMM V1 LP token for creator or partner
     * @param claimDammV1LpTokenParam - The parameters for the claim
     * @returns A claim transaction
     */
    async claimDammV1LpToken(
        claimDammV1LpTokenParam: DammLpTokenParam
    ): Promise<Transaction> {
        const virtualPoolState = await this.fetchVirtualPoolState(
            claimDammV1LpTokenParam.virtualPool
        )

        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${claimDammV1LpTokenParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.fetchPoolConfigState(
            virtualPoolState.config
        )

        const dammPool = deriveDammPoolAddress(
            claimDammV1LpTokenParam.dammConfig,
            virtualPoolState.baseMint,
            poolConfigState.quoteMint
        )

        const migrationMetadata = deriveDammMigrationMetadataAddress(
            claimDammV1LpTokenParam.virtualPool,
            DYNAMIC_BONDING_CURVE_PROGRAM_ID,
            false
        )

        const lpMint = deriveLpMintAddress(dammPool, DAMM_V1_PROGRAM_ID)

        const destinationToken = findAssociatedTokenAddress(
            claimDammV1LpTokenParam.payer,
            lpMint,
            TOKEN_PROGRAM_ID
        )

        const preInstructions: TransactionInstruction[] = []

        const createDestinationTokenIx =
            createAssociatedTokenAccountIdempotentInstruction(
                claimDammV1LpTokenParam.payer,
                destinationToken,
                claimDammV1LpTokenParam.payer,
                lpMint,
                TOKEN_PROGRAM_ID
            )

        preInstructions.push(createDestinationTokenIx)

        const sourceToken = getAssociatedTokenAddressSync(
            lpMint,
            this.poolAuthority,
            true
        )

        return this.program.methods
            .migrateMeteoraDammClaimLpToken()
            .accountsPartial({
                virtualPool: claimDammV1LpTokenParam.virtualPool,
                migrationMetadata,
                poolAuthority: this.poolAuthority,
                lpMint,
                sourceToken,
                destinationToken,
                owner: claimDammV1LpTokenParam.isPartner
                    ? poolConfigState.feeClaimer
                    : virtualPoolState.creator,
                sender: claimDammV1LpTokenParam.payer,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .preInstructions(preInstructions)
            .transaction()
    }

    ///////////////////////
    // DAMM V2 FUNCTIONS //
    ///////////////////////

    /**
     * Migrate to DAMM V2
     * @param migrateToDammV2Param - The parameters for the migration
     * @returns A migrate transaction
     */
    async migrateToDammV2(
        migrateToDammV2Param: MigrateToDammV2Param
    ): Promise<MigrateToDammV2Response> {
        const dammPoolAuthority = derivePoolAuthority(DAMM_V2_PROGRAM_ID)
        const dammEventAuthority = deriveDammV2EventAuthority()

        const virtualPoolState = await this.fetchVirtualPoolState(
            migrateToDammV2Param.virtualPool
        )

        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${migrateToDammV2Param.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.fetchPoolConfigState(
            virtualPoolState.config
        )

        const migrationMetadata = deriveDammMigrationMetadataAddress(
            migrateToDammV2Param.virtualPool,
            this.program.programId,
            true
        )

        const dammPool = deriveDammV2PoolAddress(
            migrateToDammV2Param.dammConfig,
            virtualPoolState.baseMint,
            poolConfigState.quoteMint
        )

        const firstPositionNftKP = Keypair.generate()
        const firstPosition = derivePositionAddress(
            firstPositionNftKP.publicKey
        )
        const firstPositionNftAccount = derivePositionNftAccount(
            firstPositionNftKP.publicKey
        )

        const secondPositionNftKP = Keypair.generate()
        const secondPosition = derivePositionAddress(
            secondPositionNftKP.publicKey
        )
        const secondPositionNftAccount = derivePositionNftAccount(
            secondPositionNftKP.publicKey
        )

        const tokenAVault = deriveTokenVaultAddress(
            dammPool,
            virtualPoolState.baseMint,
            DAMM_V2_PROGRAM_ID
        )

        const tokenBVault = deriveTokenVaultAddress(
            dammPool,
            poolConfigState.quoteMint,
            DAMM_V2_PROGRAM_ID
        )

        const tokenBaseProgram =
            poolConfigState.tokenType == 0
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID

        const tokenQuoteProgram =
            poolConfigState.quoteTokenFlag == 0
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID

        const tx = await this.program.methods
            .migrationDammV2()
            .accountsPartial({
                virtualPool: migrateToDammV2Param.virtualPool,
                migrationMetadata,
                config: virtualPoolState.config,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                firstPositionNftMint: firstPositionNftKP.publicKey,
                firstPosition,
                firstPositionNftAccount,
                secondPositionNftMint: secondPositionNftKP.publicKey,
                secondPosition,
                secondPositionNftAccount,
                dammPoolAuthority,
                ammProgram: DAMM_V2_PROGRAM_ID,
                baseMint: virtualPoolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                tokenAVault,
                tokenBVault,
                baseVault: virtualPoolState.baseVault,
                quoteVault: virtualPoolState.quoteVault,
                payer: migrateToDammV2Param.payer,
                tokenBaseProgram,
                tokenQuoteProgram,
                token2022Program: TOKEN_2022_PROGRAM_ID,
                dammEventAuthority,
            })
            .remainingAccounts([
                {
                    isSigner: false,
                    isWritable: false,
                    pubkey: migrateToDammV2Param.dammConfig,
                },
            ])
            .transaction()

        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 500000,
        })

        tx.add(modifyComputeUnits)

        return {
            transaction: tx,
            firstPositionNftKeypair: firstPositionNftKP,
            secondPositionNftKeypair: secondPositionNftKP,
        }
    }
}
