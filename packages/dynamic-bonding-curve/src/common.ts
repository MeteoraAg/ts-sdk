import {
    Connection,
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
} from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
    deriveLpMintAddress,
    deriveTokenVaultKey,
    deriveVaultAddress,
} from './derive'
import type { DynamicVault } from './idl/dynamic-vault/idl'
import type { Program } from '@coral-xyz/anchor'
import type { DammV1 } from './idl/damm-v1/idl'
import {
    MigrationOption,
    Rounding,
    type LiquidityDistributionParameters,
    type LockedVestingParameters,
    type PrepareSwapParams,
    type TokenType,
} from './types'
import { getTokenProgram } from './utils'
import { BASE_ADDRESS, MAX_SQRT_PRICE, MIN_SQRT_PRICE } from './constants'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import {
    getDeltaAmountQuoteUnsigned,
    getInitialLiquidityFromDeltaBase,
    getInitialLiquidityFromDeltaQuote,
    getNextSqrtPriceFromInput,
} from './math/curve'

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
    connection: Connection,
    payer: PublicKey,
    pool: PublicKey,
    lpMint: PublicKey,
    escrowOwner: PublicKey,
    lockEscrowKey: PublicKey,
    dammV1Program: Program<DammV1>
): Promise<TransactionInstruction> {
    const ix = await dammV1Program.methods
        .createLockEscrow()
        .accountsStrict({
            pool,
            lpMint,
            owner: escrowOwner,
            lockEscrow: lockEscrowKey,
            systemProgram: SystemProgram.programId,
            payer: payer,
        })
        .instruction()

    return ix
}

/**
 * Prepare swap parameters
 * @param swapBaseForQuote - Whether to swap base for quote
 * @param virtualPoolState - The virtual pool state
 * @param poolConfigState - The pool config state
 * @returns The prepare swap parameters
 */
export function prepareSwapParams(
    swapBaseForQuote: boolean,
    virtualPoolState: {
        baseMint: PublicKey
        poolType: TokenType
    },
    poolConfigState: {
        quoteMint: PublicKey
        quoteTokenFlag: TokenType
    }
): PrepareSwapParams {
    if (swapBaseForQuote) {
        return {
            inputMint: new PublicKey(virtualPoolState.baseMint),
            outputMint: new PublicKey(poolConfigState.quoteMint),
            inputTokenProgram: getTokenProgram(virtualPoolState.poolType),
            outputTokenProgram: getTokenProgram(poolConfigState.quoteTokenFlag),
        }
    } else {
        return {
            inputMint: new PublicKey(poolConfigState.quoteMint),
            outputMint: new PublicKey(virtualPoolState.baseMint),
            inputTokenProgram: getTokenProgram(poolConfigState.quoteTokenFlag),
            outputTokenProgram: getTokenProgram(virtualPoolState.poolType),
        }
    }
}

/**
 * Get the sqrt price from the price
 * @param price - The price
 * @param tokenADecimal - The decimal of token A
 * @param tokenBDecimal - The decimal of token B
 * @returns The sqrt price
 */
// Original formula: price = (sqrtPrice >> 64)^2 * 10^(tokenADecimal - tokenBDecimal)
export const getSqrtPriceFromPrice = (
    price: string,
    tokenADecimal: number,
    tokenBDecimal: number
): BN => {
    const decimalPrice = new Decimal(price)
    const adjustedByDecimals = decimalPrice.div(
        new Decimal(10 ** (tokenADecimal - tokenBDecimal))
    )
    const sqrtValue = Decimal.sqrt(adjustedByDecimals)
    const sqrtValueQ64 = sqrtValue.mul(Decimal.pow(2, 64))

    return new BN(sqrtValueQ64.floor().toFixed())
}

/**
 * Get the base token for swap
 * @param sqrtStartPrice - The start sqrt price
 * @param sqrtMigrationPrice - The migration sqrt price
 * @param curve - The curve
 * @returns The base token
 */
export function getBaseTokenForSwap(
    sqrtStartPrice: BN,
    sqrtMigrationPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): BN {
    let totalAmount = new BN(0)
    for (let i = 0; i < curve.length; i++) {
        const lowerSqrtPrice = i == 0 ? sqrtStartPrice : curve[i - 1].sqrtPrice
        if (curve[i].sqrtPrice && curve[i].sqrtPrice.gt(sqrtMigrationPrice)) {
            const deltaAmount = getDeltaAmountBase(
                lowerSqrtPrice,
                sqrtMigrationPrice,
                curve[i].liquidity
            )
            totalAmount = totalAmount.add(deltaAmount)
            break
        } else {
            const deltaAmount = getDeltaAmountBase(
                lowerSqrtPrice,
                curve[i].sqrtPrice,
                curve[i].liquidity
            )
            totalAmount = totalAmount.add(deltaAmount)
        }
    }
    return totalAmount
}

/**
 * Calculates the amount of base token needed for a price range
 * @param lowerSqrtPrice - The lower sqrt price
 * @param upperSqrtPrice - The upper sqrt price
 * @param liquidity - The liquidity
 * @returns The delta amount base
 */
export function getDeltaAmountBase(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN
): BN {
    // Formula: Δx = L * (√Pb - √Pa) / (√Pa * √Pb)
    // Where:
    // - L is the liquidity
    // - √Pa is the lower sqrt price
    // - √Pb is the upper sqrt price
    const numerator = liquidity.mul(upperSqrtPrice.sub(lowerSqrtPrice))
    const denominator = lowerSqrtPrice.mul(upperSqrtPrice)
    return numerator.add(denominator).sub(new BN(1)).div(denominator)
}

/**
 * Get the base token for migration
 * @param migrationQuoteThreshold - The migration quote threshold
 * @param sqrtMigrationPrice - The migration sqrt price
 * @param migrationOption - The migration option
 * @returns The base token
 */
export const getMigrationBaseToken = (
    migrationQuoteThreshold: BN,
    sqrtMigrationPrice: BN,
    migrationOption: MigrationOption
): BN => {
    if (migrationOption == MigrationOption.MET_DAMM) {
        const price = sqrtMigrationPrice.mul(sqrtMigrationPrice)
        const quote = migrationQuoteThreshold.shln(128)
        const { div: baseDiv, mod } = quote.divmod(price)
        let div = baseDiv
        if (!mod.isZero()) {
            div = div.add(new BN(1))
        }
        return div
    } else if (migrationOption == MigrationOption.MET_DAMM_V2) {
        const liquidity = getInitialLiquidityFromDeltaQuote(
            migrationQuoteThreshold,
            MIN_SQRT_PRICE,
            sqrtMigrationPrice
        )
        // calculate base threshold
        const baseAmount = getDeltaAmountBase(
            sqrtMigrationPrice,
            MAX_SQRT_PRICE,
            liquidity
        )
        return baseAmount
    } else {
        throw Error('Invalid migration option')
    }
}

/**
 * Get the total vesting amount
 * @param lockedVesting - The locked vesting
 * @returns The total vesting amount
 */
export const getTotalVestingAmount = (
    lockedVesting: LockedVestingParameters
): BN => {
    const totalVestingAmount = lockedVesting.cliffUnlockAmount.add(
        lockedVesting.amountPerPeriod.mul(lockedVesting.numberOfPeriod)
    )
    return totalVestingAmount
}

/**
 * Get the liquidity
 * @param baseAmount - The base amount
 * @param quoteAmount - The quote amount
 * @param minSqrtPrice - The min sqrt price
 * @param maxSqrtPrice - The max sqrt price
 * @returns The liquidity
 */
export const getLiquidity = (
    baseAmount: BN,
    quoteAmount: BN,
    minSqrtPrice: BN,
    maxSqrtPrice: BN
): BN => {
    const liquidityFromBase = getInitialLiquidityFromDeltaBase(
        baseAmount,
        maxSqrtPrice,
        minSqrtPrice
    )
    const liquidityFromQuote = getInitialLiquidityFromDeltaQuote(
        quoteAmount,
        minSqrtPrice,
        maxSqrtPrice
    )
    return BN.min(liquidityFromBase, liquidityFromQuote)
}

/**
 * Get the first curve
 * @param migrationSqrPrice - The migration sqrt price
 * @param migrationAmount - The migration amount
 * @param swapAmount - The swap amount
 * @param migrationQuoteThreshold - The migration quote threshold
 * @returns The first curve
 */
export const getFirstCurve = (
    migrationSqrPrice: BN,
    migrationAmount: BN,
    swapAmount: BN,
    migrationQuoteThreshold: BN
) => {
    const sqrtStartPrice = migrationSqrPrice
        .mul(migrationAmount)
        .div(swapAmount)
    const liquidity = getLiquidity(
        swapAmount,
        migrationQuoteThreshold,
        sqrtStartPrice,
        migrationSqrPrice
    )
    return {
        sqrtStartPrice,
        curve: [
            {
                sqrtPrice: migrationSqrPrice,
                liquidity,
            },
        ],
    }
}

/**
 * Get the total supply from curve
 * @param migrationQuoteThreshold - The migration quote threshold
 * @param sqrtStartPrice - The start sqrt price
 * @param curve - The curve
 * @param lockedVesting - The locked vesting
 * @param migrationOption - The migration option
 * @returns The total supply
 */
export const getTotalSupplyFromCurve = (
    migrationQuoteThreshold: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>,
    lockedVesting: LockedVestingParameters,
    migrationOption: MigrationOption
): BN => {
    const sqrtMigrationPrice = getMigrationThresholdPrice(
        migrationQuoteThreshold,
        sqrtStartPrice,
        curve
    )
    const swapBaseAmount = getBaseTokenForSwap(
        sqrtStartPrice,
        sqrtMigrationPrice,
        curve
    )
    const swapBaseAmountBuffer = getSwapAmountWithBuffer(
        swapBaseAmount,
        sqrtStartPrice,
        curve
    )
    const migrationBaseAmount = getMigrationBaseToken(
        migrationQuoteThreshold,
        sqrtMigrationPrice,
        migrationOption
    )
    const totalVestingAmount = getTotalVestingAmount(lockedVesting)
    const minimumBaseSupplyWithBuffer = swapBaseAmountBuffer
        .add(migrationBaseAmount)
        .add(totalVestingAmount)
    return minimumBaseSupplyWithBuffer
}

/**
 * Get the migration threshold price
 * @param migrationThreshold - The migration threshold
 * @param sqrtStartPrice - The start sqrt price
 * @param curve - The curve
 * @returns The migration threshold price
 */
export const getMigrationThresholdPrice = (
    migrationThreshold: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): BN => {
    let nextSqrtPrice = sqrtStartPrice

    if (curve.length === 0) {
        throw Error('Curve is empty')
    }

    const totalAmount = getDeltaAmountQuoteUnsigned(
        nextSqrtPrice,
        curve[0].sqrtPrice,
        curve[0].liquidity,
        Rounding.Up
    )
    if (totalAmount.gt(migrationThreshold)) {
        nextSqrtPrice = getNextSqrtPriceFromInput(
            nextSqrtPrice,
            curve[0].liquidity,
            migrationThreshold,
            false
        )
    } else {
        let amountLeft = migrationThreshold.sub(totalAmount)
        nextSqrtPrice = curve[0].sqrtPrice
        for (let i = 1; i < curve.length; i++) {
            const maxAmount = getDeltaAmountQuoteUnsigned(
                nextSqrtPrice,
                curve[i].sqrtPrice,
                curve[i].liquidity,
                Rounding.Up
            )
            if (maxAmount.gt(amountLeft)) {
                nextSqrtPrice = getNextSqrtPriceFromInput(
                    nextSqrtPrice,
                    curve[i].liquidity,
                    amountLeft,
                    false
                )
                amountLeft = new BN(0)
                break
            } else {
                amountLeft = amountLeft.sub(maxAmount)
                nextSqrtPrice = curve[i].sqrtPrice
            }
        }
        if (!amountLeft.isZero()) {
            throw Error(
                'Not enough liquidity, amountLeft: ' + amountLeft.toString()
            )
        }
    }
    return nextSqrtPrice
}

/**
 * Get the swap amount with buffer
 * @param swapBaseAmount - The swap base amount
 * @param sqrtStartPrice - The start sqrt price
 * @param curve - The curve
 * @returns The swap amount with buffer
 */
export const getSwapAmountWithBuffer = (
    swapBaseAmount: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): BN => {
    const swapAmountBuffer = swapBaseAmount.add(
        swapBaseAmount.mul(new BN(25)).div(new BN(100))
    )
    const maxBaseAmountOnCurve = getBaseTokenForSwap(
        sqrtStartPrice,
        MAX_SQRT_PRICE,
        curve
    )
    return BN.min(swapAmountBuffer, maxBaseAmountOnCurve)
}

/**
 * Calculate the percentage of supply that should be allocated to initial liquidity
 * @param initialMarketCap - The initial market cap
 * @param migrationMarketCap - The migration market cap
 * @param lockedVesting - The locked vesting
 * @param totalTokenSupply - The total token supply
 * @returns The percentage of supply for initial liquidity
 */
export const getPercentageSupplyOnMigration = (
    initialMarketCap: BN,
    migrationMarketCap: BN,
    lockedVesting: LockedVestingParameters,
    totalTokenSupply: BN
): number => {
    const initialMarketCapDecimal = new Decimal(initialMarketCap.toString())
    const migrationMarketCapDecimal = new Decimal(migrationMarketCap.toString())

    // calculate percentage of locked vesting (z)
    const totalVestingAmount = getTotalVestingAmount(lockedVesting)
    const vestingPercentageDecimal = new Decimal(totalVestingAmount.toString())
        .mul(new Decimal(100))
        .div(new Decimal(totalTokenSupply.toString()))
    const vestingPercentage = vestingPercentageDecimal.toNumber()

    // x = (initialMC * (100-z)) / (initialMC + migrationMC)
    const numerator = initialMarketCapDecimal.mul(
        new Decimal(100 - vestingPercentage)
    )
    const denominator = initialMarketCapDecimal.add(migrationMarketCapDecimal)
    return numerator.div(denominator).toNumber()
}

/**
 * Get the migration quote threshold
 * @param migrationMarketCap - The migration market cap
 * @param percentageSupplyOnMigration - The percentage of supply on migration
 * @returns The migration quote threshold
 */
export const getMigrationQuoteThreshold = (
    migrationMarketCap: BN,
    percentageSupplyOnMigration: number
): number => {
    const migrationMarketCapDecimal = new Decimal(migrationMarketCap.toString())
    const percentageDecimal = new Decimal(
        percentageSupplyOnMigration.toString()
    )

    // migrationMC * x / 100
    return migrationMarketCapDecimal
        .mul(percentageDecimal)
        .div(new Decimal(100))
        .toNumber()
}
