import { Program } from '@coral-xyz/anchor'
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import BN from 'bn.js'
import {
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
    type GetProgramAccountsFilter,
    Connection,
} from '@solana/web3.js'

import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { TokenType } from '../types'
import {
    deriveTokenVaultKey,
    deriveVaultAddress,
    deriveVaultLpMintAddress,
} from './accounts'
import { BASE_ADDRESS } from '../constants'
import type { DynamicVault } from '../idl/dynamic-vault/idl'
import type { DynamicBondingCurve } from '../idl/dynamic-bonding-curve/idl'
import type { DammV1 } from '../idl/damm-v1/idl'

/**
 * Get the first key
 * @param key1 - The first key
 * @param key2 - The second key
 * @returns The first key
 */
export function getFirstKey(key1: PublicKey, key2: PublicKey) {
    const buf1 = key1.toBuffer()
    const buf2 = key2.toBuffer()
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf1
    }
    return buf2
}

/**
 * Get the second key
 * @param key1 - The first key
 * @param key2 - The second key
 * @returns The second key
 */
export function getSecondKey(key1: PublicKey, key2: PublicKey) {
    const buf1 = key1.toBuffer()
    const buf2 = key2.toBuffer()
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf2
    }
    return buf1
}

/**
 * Get the token program for a given token type
 * @param tokenType - The token type
 * @returns The token program
 */
export function getTokenProgram(tokenType: TokenType): PublicKey {
    return tokenType === TokenType.SPL
        ? TOKEN_PROGRAM_ID
        : TOKEN_2022_PROGRAM_ID
}

/**
 * Create a memcmp filter for owner-based filtering
 * @param owner - The owner public key or string
 * @param offset - The offset where the owner field is located in the account data
 * @returns A GetProgramAccountsFilter array with the owner filter
 */
export function createProgramAccountFilter(
    owner: PublicKey | string,
    offset: number
): GetProgramAccountsFilter[] {
    const ownerKey = typeof owner === 'string' ? new PublicKey(owner) : owner
    return [
        {
            memcmp: {
                offset,
                bytes: ownerKey.toBase58(),
                encoding: 'base58',
            },
        },
    ]
}

/**
 * Generic account fetch helper
 * @param accountAddress - The address of the account to fetch
 * @param accountType - The type of account to fetch from program.account
 * @returns The fetched account data
 */
export async function getAccountData<T>(
    accountAddress: PublicKey | string,
    accountType: keyof Program<DynamicBondingCurve>['account'],
    program: Program<DynamicBondingCurve>
): Promise<T> {
    const address =
        accountAddress instanceof PublicKey
            ? accountAddress
            : new PublicKey(accountAddress)

    return (await program.account[accountType].fetchNullable(address)) as T
}

/**
 * Get creation timestamp for an account
 * @param accountAddress - The address of the account
 * @param connection - The Solana connection instance
 * @returns The creation timestamp as a Date object, or undefined if not found
 */
export async function getAccountCreationTimestamp(
    accountAddress: PublicKey | string,
    connection: Connection
): Promise<Date | undefined> {
    const address =
        accountAddress instanceof PublicKey
            ? accountAddress
            : new PublicKey(accountAddress)

    const signatures = await connection.getSignaturesForAddress(address, {
        limit: 1,
    })

    return signatures[0]?.blockTime
        ? new Date(signatures[0].blockTime * 1000)
        : undefined
}

/**
 * Get creation timestamps for multiple accounts
 * @param accountAddresses - Array of account addresses
 * @param connection - The Solana connection instance
 * @returns Array of creation timestamps corresponding to the input addresses
 */
export async function getAccountCreationTimestamps(
    accountAddresses: (PublicKey | string)[],
    connection: Connection
): Promise<(Date | undefined)[]> {
    const timestampPromises = accountAddresses.map((address) =>
        getAccountCreationTimestamp(address, connection)
    )
    return Promise.all(timestampPromises)
}

/**
 * Check if a mint is the native SOL mint
 * @param mint - The mint to check
 * @returns Whether the mint is the native SOL mint
 */
export function isNativeSol(mint: PublicKey): boolean {
    return mint.toString() === NATIVE_MINT.toString()
}

/**
 * Get the total token supply
 * @param swapBaseAmount - The swap base amount
 * @param migrationBaseThreshold - The migration base threshold
 * @param lockedVestingParams - The locked vesting parameters
 * @returns The total token supply
 */
export function getTotalTokenSupply(
    swapBaseAmount: BN,
    migrationBaseThreshold: BN,
    lockedVestingParams: {
        amountPerPeriod: BN
        numberOfPeriod: BN
        cliffUnlockAmount: BN
    }
): BN {
    try {
        // calculate total circulating amount
        const totalCirculatingAmount = swapBaseAmount.add(
            migrationBaseThreshold
        )

        // calculate total locked vesting amount
        const totalLockedVestingAmount =
            lockedVestingParams.cliffUnlockAmount.add(
                lockedVestingParams.amountPerPeriod.mul(
                    lockedVestingParams.numberOfPeriod
                )
            )

        // calculate total amount
        const totalAmount = totalCirculatingAmount.add(totalLockedVestingAmount)

        // check for overflow
        if (totalAmount.isNeg() || totalAmount.bitLength() > 64) {
            throw new Error('Math overflow')
        }

        return totalAmount
    } catch (error) {
        throw new Error('Math overflow')
    }
}

/**
 * Check if the locked vesting is the default
 * @param lockedVesting - The locked vesting parameters
 * @returns true if the locked vesting is the default, false otherwise
 */
export function isDefaultLockedVesting(lockedVesting: {
    amountPerPeriod: BN
    cliffDurationFromMigrationTime: BN
    frequency: BN
    numberOfPeriod: BN
    cliffUnlockAmount: BN
}): boolean {
    return (
        lockedVesting.amountPerPeriod.eqn(0) &&
        lockedVesting.cliffDurationFromMigrationTime.eqn(0) &&
        lockedVesting.frequency.eqn(0) &&
        lockedVesting.numberOfPeriod.eqn(0) &&
        lockedVesting.cliffUnlockAmount.eqn(0)
    )
}

/**
 * Create a permissionless dynamic vault
 * @param mint - The mint of the vault
 * @param payer - The payer of the vault
 * @param vaultProgram - The vault program
 * @returns The vault key, token vault key, and lp mint key
 */
export async function createInitializePermissionlessDynamicVaultIx(
    mint: PublicKey,
    payer: PublicKey,
    vaultProgram: Program<DynamicVault>
): Promise<{
    vaultKey: PublicKey
    tokenVaultKey: PublicKey
    lpMintKey: PublicKey
    instruction: TransactionInstruction
}> {
    const vaultKey = deriveVaultAddress(mint, BASE_ADDRESS)

    const tokenVaultKey = deriveTokenVaultKey(vaultKey)

    const lpMintKey = deriveVaultLpMintAddress(vaultKey)

    const ix = await vaultProgram.methods
        .initialize()
        .accountsPartial({
            vault: vaultKey,
            tokenVault: tokenVaultKey,
            tokenMint: mint,
            lpMint: lpMintKey,
            payer,
            rent: SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction()

    return {
        instruction: ix,
        vaultKey,
        tokenVaultKey,
        lpMintKey,
    }
}

/**
 * Create a lock escrow instruction
 * @param connection - The connection to the Solana network
 * @param payer - The payer of the lock escrow
 * @param pool - The pool address
 * @param lpMint - The lp mint address
 * @param escrowOwner - The owner of the escrow
 * @param lockEscrowKey - The lock escrow key
 * @param dammV1Program - The DAMM V1 program
 * @returns The lock escrow instruction
 */
export async function createLockEscrowIx(
    payer: PublicKey,
    pool: PublicKey,
    lpMint: PublicKey,
    escrowOwner: PublicKey,
    lockEscrowKey: PublicKey,
    dammV1Program: Program<DammV1>
): Promise<TransactionInstruction> {
    const ix = await dammV1Program.methods
        .createLockEscrow()
        .accountsPartial({
            pool,
            lpMint,
            owner: escrowOwner,
            lockEscrow: lockEscrowKey,
            payer: payer,
            systemProgram: SystemProgram.programId,
        })
        .instruction()

    return ix
}

/**
 * Calculate the variable fee for a bin
 * @param variableFeeControl - The variable fee control parameter (A)
 * @param volatilityAccumulator - The volatility accumulator for the bin
 * @param binStep - The bin step
 * @returns The variable fee
 * formula: f_v(k) = A(v_a(k) * s)^2
 * where:
 * - f_v(k) is the variable fee for bin k
 * - A is the variable fee control parameter
 * - v_a(k) is the volatility accumulator for bin k
 * - s is the bin step
 */
export function calculateVariableFee(
    variableFeeControl: number,
    volatilityAccumulator: number,
    binStep: number
): number {
    return variableFeeControl * Math.pow(volatilityAccumulator * binStep, 2)
}

/**
 * Calculate the total swap fee (base fee + variable fee)
 * @param baseFee - The base fee
 * @param variableFee - The variable fee
 * @returns The total swap fee
 * formula: f_s = f_b + f_v
 * where:
 * - f_s is the total swap fee
 * - f_b is the base fee
 * - f_v is the variable fee
 */
export function calculateTotalSwapFee(
    baseFee: number,
    variableFee: number
): number {
    return baseFee + variableFee
}

/**
 * Calculate the volatility accumulator for a bin
 * @param volatilityReference - The volatility reference
 * @param indexReference - The index reference
 * @param activeId - The active bin ID
 * @param k - The bin offset
 * @returns The volatility accumulator
 * formula: v_a(k) = v_r + |i_r - (activeID + k)|
 * where:
 * - v_a(k) is the volatility accumulator for bin k
 * - v_r is the volatility reference
 * - i_r is the index reference
 * - activeID is the ID of the active bin before the swap
 * - k is the bin offset
 */
export function calculateVolatilityAccumulator(
    volatilityReference: number,
    indexReference: number,
    activeId: number,
    k: number
): number {
    return volatilityReference + Math.abs(indexReference - (activeId + k))
}

/**
 * Calculate the volatility reference based on time elapsed
 * @param timeElapsed - Time elapsed since last transaction
 * @param filterPeriod - Filter period
 * @param decayPeriod - Decay period
 * @param reductionFactor - Reduction factor
 * @param previousVolatilityAccumulator - Previous volatility accumulator
 * @returns The new volatility reference
 *
 * formula: v_r = {
 *     v_r,                   if t < t_f
 *     R * v_a,               if t_f ≤ t < t_d
 *     0,                     if t_d ≤ t
 * }
 * where:
 * - v_r is the volatility reference
 * - t is time elapsed since last transaction
 * - t_f is filter period
 * - t_d is decay period
 * - R is reduction factor
 * - v_a is previous volatility accumulator
 */
export function calculateVolatilityReference(
    timeElapsed: number,
    filterPeriod: number,
    decayPeriod: number,
    reductionFactor: number,
    previousVolatilityAccumulator: number
): number {
    if (timeElapsed < filterPeriod) {
        return previousVolatilityAccumulator
    } else if (timeElapsed >= decayPeriod) {
        return 0
    } else {
        return (reductionFactor / 10000) * previousVolatilityAccumulator
    }
}

/**
 * Calculate the index reference based on time elapsed
 * @param timeElapsed - Time elapsed since last transaction
 * @param filterPeriod - Filter period
 * @param activeId - The active bin ID
 * @param previousIndexReference - Previous index reference
 * @returns The new index reference
 *
 * Formula: i_r = {
 *     i_r,                   if t < t_f
 *     activeID,              if t_f ≤ t
 * }
 * where:
 * - i_r is the index reference
 * - t is time elapsed since last transaction
 * - t_f is filter period
 * - activeID is the ID of the active bin before the swap
 */
export function calculateIndexReference(
    timeElapsed: number,
    filterPeriod: number,
    activeId: number,
    previousIndexReference: number
): number {
    return timeElapsed < filterPeriod ? previousIndexReference : activeId
}

/**
 * Calculate dynamic fee parameters to achieve a target ratio with base fee
 * @param baseFeeBps - Base fee in basis points
 * @param targetRatio - Target ratio of dynamic fee to base fee (e.g. 0.2 for 20%)
 * @returns Object containing calculated dynamic fee parameters
 *
 * formulas:
 * 1. Base Fee: f_b = B * s
 *    where B is base factor and s is bin step
 *
 * 2. Variable Fee: f_v(k) = A(v_a(k) * s)^2
 *    where A is variable fee control, v_a(k) is volatility accumulator, s is bin step
 *
 * 3. Total Fee: f_s = f_b + f_v
 *
 * f_v = targetRatio * f_b when v_a = 1 and s = 1
 * Therefore: A = targetRatio * f_b when targetRatio is 20%
 */
export function calculateDynamicFeeParameters(
    baseFeeBps: number,
    targetRatio: number = 0.2
): {
    binStep: number
    binStepU128: BN
    filterPeriod: number
    decayPeriod: number
    reductionFactor: number
    variableFeeControl: number
    maxVolatilityAccumulator: number
} {
    // Convert base fee from bps to the same scale as cliffFeeNumerator
    const baseFee = baseFeeBps * 100000

    // calculate variable fee control to achieve target ratio (20% of base fee)
    // f_v = targetRatio * f_b when v_a = 1 and s = 1
    // f_v = A(v_a * s)^2
    // targetRatio * f_b = A(1 * 1)^2
    // A = targetRatio * f_b
    const variableFeeControl = Math.floor(baseFee * targetRatio)

    return {
        binStep: 1,
        binStepU128: new BN('1844674407370955'),
        filterPeriod: 10,
        decayPeriod: 120,
        reductionFactor: 5000,
        variableFeeControl,
        maxVolatilityAccumulator: 100000,
    }
}
