import { Program } from '@coral-xyz/anchor'
import { TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import BN from 'bn.js'
import {
    PublicKey,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
    type GetProgramAccountsFilter,
} from '@solana/web3.js'

import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { TokenType } from '../types'
import {
    deriveLpMintAddress,
    deriveTokenVaultKey,
    deriveVaultAddress,
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
 * Check if a mint is the native SOL mint
 * @param mint - The mint to check
 * @returns Whether the mint is the native SOL mint
 */
export function isNativeSol(mint: PublicKey): boolean {
    return mint.toString() === NATIVE_MINT.toString()
}

// Helper function to convert BN values to decimal strings
export function convertBNToDecimal<T>(obj: T): T {
    if (obj instanceof BN) {
        return obj.toString(10) as T
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => convertBNToDecimal(item)) as T
    }
    if (obj && typeof obj === 'object') {
        const result = {} as T
        for (const key in obj) {
            result[key] = convertBNToDecimal(obj[key])
        }
        return result
    }
    return obj
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

    const lpMintKey = deriveLpMintAddress(vaultKey, vaultProgram.programId)

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
        })
        .instruction()

    return ix
}
