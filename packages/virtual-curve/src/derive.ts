import { PublicKey } from '@solana/web3.js'
import { METADATA_PROGRAM_ID } from './constants'

const SEED = Object.freeze({
    POOL_AUTHORITY: 'pool_authority',
    POOL: 'pool',
    TOKEN_VAULT: 'token_vault',
    METADATA: 'metadata',
    EVENT_AUTHORITY: '__event_authority',
})

/**
 * Derive the event authority
 * @param programId - The program ID
 * @returns The event authority
 */
export function deriveEventAuthority(programId: PublicKey): PublicKey {
    const [eventAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.EVENT_AUTHORITY)],
        programId
    )
    return eventAuthority
}

/**
 * Derive the pool authority
 * @param programId - The program ID
 * @returns The pool authority
 */
export function derivePoolAuthority(programId: PublicKey): PublicKey {
    const [poolAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.POOL_AUTHORITY)],
        programId
    )

    return poolAuthority
}

/**
 * Derive the pool
 * @param quoteMint - The quote mint
 * @param baseMint - The base mint
 * @param config - The config
 * @param programId - The program ID
 * @returns The pool
 */
export function derivePool(
    quoteMint: PublicKey,
    baseMint: PublicKey,
    config: PublicKey,
    programId: PublicKey
): PublicKey {
    const isQuoteMintBiggerThanBaseMint =
        new PublicKey(quoteMint)
            .toBuffer()
            .compare(new Uint8Array(new PublicKey(baseMint).toBuffer())) > 0

    const [pool] = PublicKey.findProgramAddressSync(
        [
            Buffer.from(SEED.POOL),
            new PublicKey(config).toBuffer(),
            isQuoteMintBiggerThanBaseMint
                ? new PublicKey(quoteMint).toBuffer()
                : new PublicKey(baseMint).toBuffer(),
            isQuoteMintBiggerThanBaseMint
                ? new PublicKey(baseMint).toBuffer()
                : new PublicKey(quoteMint).toBuffer(),
        ],
        programId
    )

    return pool
}

/**
 * Derive the token vault
 * @param pool - The pool
 * @param mint - The mint
 * @param programId - The program ID
 * @returns The token vault
 */
export function deriveTokenVault(
    pool: PublicKey,
    mint: PublicKey,
    programId: PublicKey
): PublicKey {
    const [tokenVault] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.TOKEN_VAULT), mint.toBuffer(), pool.toBuffer()],
        programId
    )

    return tokenVault
}

/**
 * Derive the metadata
 * @param mint - The mint
 * @returns The metadata
 */
export function deriveMetadata(mint: PublicKey): PublicKey {
    const [metadata] = PublicKey.findProgramAddressSync(
        [
            Buffer.from(SEED.METADATA),
            METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        METADATA_PROGRAM_ID
    )

    return metadata
}

/**
 * Derive the partner metadata
 * @param feeClaimer - The fee claimer
 * @param programId - The program ID
 * @returns The partner metadata
 */
export function derivePartnerMetadata(
    feeClaimer: PublicKey,
    programId: PublicKey
): PublicKey {
    const [partnerMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from('partner_metadata'), feeClaimer.toBuffer()],
        programId
    )
    return partnerMetadata
}

/**
 * Derive the claim fee operator address
 * @param operator - The operator
 * @param programId - The program ID
 * @returns The claim fee operator address
 */
export function deriveClaimFeeOperatorAddress(
    operator: PublicKey,
    programId: PublicKey
): PublicKey {
    const [claimFeeOperator] = PublicKey.findProgramAddressSync(
        [Buffer.from('cf_operator'), operator.toBuffer()],
        programId
    )
    return claimFeeOperator
}
