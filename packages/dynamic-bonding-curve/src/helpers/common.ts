import {
    ActivationType,
    BaseFee,
    DynamicFeeParameters,
    FeeSchedulerMode,
    MigrationOption,
    Rounding,
    TokenDecimal,
    type LiquidityDistributionParameters,
    type LockedVestingParameters,
} from '../types'
import {
    BASIS_POINT_MAX,
    BIN_STEP_BPS_DEFAULT,
    BIN_STEP_BPS_U128_DEFAULT,
    DYNAMIC_FEE_DECAY_PERIOD_DEFAULT,
    DYNAMIC_FEE_FILTER_PERIOD_DEFAULT,
    DYNAMIC_FEE_REDUCTION_FACTOR_DEFAULT,
    FEE_DENOMINATOR,
    MAX_FEE_NUMERATOR,
    MAX_PRICE_CHANGE_BPS_DEFAULT,
    MAX_SQRT_PRICE,
    MIN_SQRT_PRICE,
    ONE_Q64,
    SLOT_DURATION,
    TIMESTAMP_DURATION,
} from '../constants'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import {
    getDeltaAmountQuoteUnsigned,
    getInitialLiquidityFromDeltaBase,
    getInitialLiquidityFromDeltaQuote,
    getNextSqrtPriceFromInput,
} from '../math/curve'
import { pow } from '../math/safeMath'
import { Connection, PublicKey } from '@solana/web3.js'
import type { DynamicBondingCurve } from '../idl/dynamic-bonding-curve/idl'
import { Program } from '@coral-xyz/anchor'
import { bpsToFeeNumerator, feeNumeratorToBps } from './utils'

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
 * Get the price from the sqrt start price
 * @param sqrtStartPrice - The sqrt start price
 * @param tokenBaseDecimal - The base token decimal
 * @param tokenQuoteDecimal - The quote token decimal
 * @returns The initial price
 */
export function getPriceFromSqrtStartPrice(
    sqrtStartPrice: BN,
    tokenBaseDecimal: TokenDecimal,
    tokenQuoteDecimal: TokenDecimal
): Decimal {
    // lamport price = sqrtStartPrice * sqrtStartPrice / 2^128
    const sqrtStartPriceDecimal = new Decimal(sqrtStartPrice.toString())
    const lamportPrice = sqrtStartPriceDecimal
        .mul(sqrtStartPriceDecimal)
        .div(new Decimal(2).pow(128))

    // token price = lamport price * 10^(base_decimal - quote_decimal)
    const tokenPrice = lamportPrice.mul(
        new Decimal(10).pow(tokenBaseDecimal - tokenQuoteDecimal)
    )

    return tokenPrice
}

/**
 * Get the sqrt price from the price
 * @param price - The price
 * @param tokenADecimal - The decimal of token A
 * @param tokenBDecimal - The decimal of token B
 * @returns The sqrt price
 * price = (sqrtPrice >> 64)^2 * 10^(tokenADecimal - tokenBDecimal)
 */
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
 * Get the sqrt price from the market cap
 * @param marketCap - The market cap
 * @param totalSupply - The total supply
 * @param tokenBaseDecimal - The decimal of the base token
 * @param tokenQuoteDecimal - The decimal of the quote token
 * @returns The sqrt price
 */
export const getSqrtPriceFromMarketCap = (
    marketCap: number,
    totalSupply: number,
    tokenBaseDecimal: number,
    tokenQuoteDecimal: number
): BN => {
    let price = new Decimal(marketCap).div(new Decimal(totalSupply))
    return getSqrtPriceFromPrice(
        price.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )
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
    migrationOption: MigrationOption,
    leftover: BN
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
        .add(leftover)
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
            let migrationThresholdStr = migrationThreshold.toString()
            let amountLeftStr = amountLeft.toString()
            throw Error(
                `Not enough liquidity, migrationThreshold: ${migrationThresholdStr}  amountLeft: ${amountLeftStr}`
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
 * Get the percentage of supply that should be allocated to initial liquidity
 * @param initialMarketCap - The initial market cap
 * @param migrationMarketCap - The migration market cap
 * @param lockedVesting - The locked vesting
 * @param totalTokenSupply - The total token supply
 * @returns The percentage of supply for initial liquidity
 */
export const getPercentageSupplyOnMigration = (
    initialMarketCap: Decimal,
    migrationMarketCap: Decimal,
    lockedVesting: LockedVestingParameters,
    totalTokenSupply: BN
): number => {
    // formula: x = sqrt(initialMC / migrationMC) * (100 - z) / (1 + sqrt(initialMC / migrationMC))

    // sqrt(initial_MC / migration_MC)
    const marketCapRatio = initialMarketCap.div(migrationMarketCap)
    const sqrtRatio = Decimal.sqrt(marketCapRatio)

    // locked vesting percentage
    const totalVestingAmount = getTotalVestingAmount(lockedVesting)
    const vestingPercentageDecimal = new Decimal(totalVestingAmount.toString())
        .mul(new Decimal(100))
        .div(new Decimal(totalTokenSupply.toString()))
    const vestingPercentage = vestingPercentageDecimal.toNumber()

    // (100 * sqrtRatio - lockedVesting * sqrtRatio) / (1 + sqrtRatio)
    const numerator = new Decimal(100)
        .mul(sqrtRatio)
        .sub(new Decimal(vestingPercentage).mul(sqrtRatio))
    const denominator = new Decimal(1).add(sqrtRatio)
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

/**
 * Calculates base fee parameters for a fee scheduler system.
 * @param {number} maxBaseFeeBps - Maximum fee in basis points
 * @param {number} minBaseFeeBps - Minimum fee in basis points
 * @param {FeeSchedulerMode} feeSchedulerMode - Mode for fee reduction (Linear or Exponential)
 * @param {number} numberOfPeriod - Number of periods over which to schedule fee reduction
 * @param {BN} periodFrequency - Time interval between fee reductions
 *
 * @returns {BaseFee}
 */
export function getBaseFeeParams(
    startingBaseFeeBps: number,
    endingBaseFeeBps: number,
    feeSchedulerMode: FeeSchedulerMode,
    numberOfPeriod: number,
    totalDuration: number
): BaseFee {
    if (startingBaseFeeBps == endingBaseFeeBps) {
        if (numberOfPeriod != 0 || totalDuration != 0) {
            throw new Error(
                'numberOfPeriod and totalDuration must both be zero'
            )
        }

        return {
            cliffFeeNumerator: bpsToFeeNumerator(startingBaseFeeBps),
            numberOfPeriod: 0,
            periodFrequency: new BN(0),
            reductionFactor: new BN(0),
            feeSchedulerMode: FeeSchedulerMode.Linear,
        }
    }

    if (numberOfPeriod <= 0) {
        throw new Error('Total periods must be greater than zero')
    }

    if (startingBaseFeeBps > feeNumeratorToBps(new BN(MAX_FEE_NUMERATOR))) {
        throw new Error(
            `startingBaseFeeBps (${startingBaseFeeBps} bps) exceeds maximum allowed value of ${feeNumeratorToBps(
                new BN(MAX_FEE_NUMERATOR)
            )} bps`
        )
    }

    if (endingBaseFeeBps > startingBaseFeeBps) {
        throw new Error(
            'endingBaseFeeBps bps must be less than or equal to startingBaseFeeBps bps'
        )
    }

    if (numberOfPeriod == 0 || totalDuration == 0) {
        throw new Error(
            'numberOfPeriod and totalDuration must both greater than zero'
        )
    }

    const maxBaseFeeNumerator = bpsToFeeNumerator(startingBaseFeeBps)

    const minBaseFeeNumerator = bpsToFeeNumerator(endingBaseFeeBps)

    const periodFrequency = new BN(totalDuration / numberOfPeriod)

    let reductionFactor: BN
    if (feeSchedulerMode == FeeSchedulerMode.Linear) {
        const totalReduction = maxBaseFeeNumerator.sub(minBaseFeeNumerator)
        reductionFactor = totalReduction.divn(numberOfPeriod)
    } else {
        const ratio =
            minBaseFeeNumerator.toNumber() / maxBaseFeeNumerator.toNumber()
        const decayBase = Math.pow(ratio, 1 / numberOfPeriod)
        reductionFactor = new BN(BASIS_POINT_MAX * (1 - decayBase))
    }

    return {
        cliffFeeNumerator: maxBaseFeeNumerator,
        numberOfPeriod,
        periodFrequency,
        reductionFactor,
        feeSchedulerMode,
    }
}

/**
 * Get the minimum base fee in basis points
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param numberOfPeriod - The number of period
 * @param reductionFactor - The reduction factor
 * @param feeSchedulerMode - The fee scheduler mode
 * @returns The minimum base fee in basis points
 */
export function getMinBaseFeeBps(
    cliffFeeNumerator: number,
    numberOfPeriod: number,
    reductionFactor: number,
    feeSchedulerMode: FeeSchedulerMode
): number {
    let baseFeeNumerator: number
    if (feeSchedulerMode == FeeSchedulerMode.Linear) {
        // linear mode
        baseFeeNumerator = cliffFeeNumerator - numberOfPeriod * reductionFactor
    } else {
        // exponential mode
        const decayRate = 1 - reductionFactor / BASIS_POINT_MAX
        baseFeeNumerator =
            cliffFeeNumerator * Math.pow(decayRate, numberOfPeriod)
    }

    // ensure base fee is not negative
    return Math.max(0, (baseFeeNumerator / FEE_DENOMINATOR) * BASIS_POINT_MAX)
}

/**
 * Get the dynamic fee parameters (20% of base fee)
 * @param baseFeeBps - The base fee in basis points
 * @param maxPriceChangeBps - The max price change in basis points
 * @returns The dynamic fee parameters
 */
export function getDynamicFeeParams(
    baseFeeBps: number,
    maxPriceChangeBps: number = MAX_PRICE_CHANGE_BPS_DEFAULT // default 15%
): DynamicFeeParameters {
    if (maxPriceChangeBps > MAX_PRICE_CHANGE_BPS_DEFAULT) {
        throw new Error(
            `maxPriceChangeBps (${maxPriceChangeBps} bps) must be less than or equal to ${MAX_PRICE_CHANGE_BPS_DEFAULT}`
        )
    }

    const priceRatio = maxPriceChangeBps / BASIS_POINT_MAX + 1
    // Q64
    const sqrtPriceRatioQ64 = new BN(
        Decimal.sqrt(priceRatio.toString())
            .mul(Decimal.pow(2, 64))
            .floor()
            .toFixed()
    )
    const deltaBinId = sqrtPriceRatioQ64
        .sub(ONE_Q64)
        .div(BIN_STEP_BPS_U128_DEFAULT)
        .muln(2)

    const maxVolatilityAccumulator = new BN(deltaBinId.muln(BASIS_POINT_MAX))

    const squareVfaBin = maxVolatilityAccumulator
        .mul(new BN(BIN_STEP_BPS_DEFAULT))
        .pow(new BN(2))

    const baseFeeNumerator = new BN(bpsToFeeNumerator(baseFeeBps))

    const maxDynamicFeeNumerator = baseFeeNumerator.muln(20).divn(100) // default max dynamic fee = 20% of min base fee
    const vFee = maxDynamicFeeNumerator
        .mul(new BN(100_000_000_000))
        .sub(new BN(99_999_999_999))

    const variableFeeControl = vFee.div(squareVfaBin)

    return {
        binStep: BIN_STEP_BPS_DEFAULT,
        binStepU128: BIN_STEP_BPS_U128_DEFAULT,
        filterPeriod: DYNAMIC_FEE_FILTER_PERIOD_DEFAULT,
        decayPeriod: DYNAMIC_FEE_DECAY_PERIOD_DEFAULT,
        reductionFactor: DYNAMIC_FEE_REDUCTION_FACTOR_DEFAULT,
        maxVolatilityAccumulator: maxVolatilityAccumulator.toNumber(),
        variableFeeControl: variableFeeControl.toNumber(),
    }
}

/**
 * Calculate the locked vesting parameters
 * @param totalLockedVestingAmount - The total vesting amount
 * @param numberOfVestingPeriod - The number of periods
 * @param cliffUnlockAmount - The amount to unlock at cliff
 * @param totalVestingDuration - The total duration of vesting
 * @param cliffDurationFromMigrationTime - The cliff duration from migration time
 * @param tokenBaseDecimal - The decimal of the base token
 * @returns The locked vesting parameters
 * total_locked_vesting_amount = cliff_unlock_amount + (amount_per_period * number_of_period)
 */
export function getLockedVestingParams(
    totalLockedVestingAmount: number,
    numberOfVestingPeriod: number,
    cliffUnlockAmount: number,
    totalVestingDuration: number,
    cliffDurationFromMigrationTime: number,
    tokenBaseDecimal: TokenDecimal,
    activationType: ActivationType
): {
    amountPerPeriod: BN
    cliffDurationFromMigrationTime: BN
    frequency: BN
    numberOfPeriod: BN
    cliffUnlockAmount: BN
} {
    if (totalLockedVestingAmount == 0) {
        return {
            amountPerPeriod: new BN(0),
            cliffDurationFromMigrationTime: new BN(0),
            frequency: new BN(0),
            numberOfPeriod: new BN(0),
            cliffUnlockAmount: new BN(0),
        }
    }

    if (totalLockedVestingAmount == cliffUnlockAmount) {
        return {
            amountPerPeriod: new BN(1).mul(
                new BN(10).pow(new BN(tokenBaseDecimal))
            ),
            cliffDurationFromMigrationTime: new BN(1),
            frequency: new BN(1),
            numberOfPeriod: new BN(1),
            cliffUnlockAmount: new BN(totalLockedVestingAmount - 1).mul(
                new BN(10).pow(new BN(tokenBaseDecimal))
            ),
        }
    }

    if (numberOfVestingPeriod <= 0) {
        throw new Error('Total periods must be greater than zero')
    }

    if (numberOfVestingPeriod == 0 || totalVestingDuration == 0) {
        throw new Error(
            'numberOfPeriod and totalVestingDuration must both be greater than zero'
        )
    }

    if (cliffUnlockAmount > totalLockedVestingAmount) {
        throw new Error(
            'Cliff unlock amount cannot be greater than total locked vesting amount'
        )
    }

    // amount_per_period = (total_locked_vesting_amount - cliff_unlock_amount) / number_of_period
    const amountPerPeriod =
        (totalLockedVestingAmount - cliffUnlockAmount) / numberOfVestingPeriod

    // round amountPerPeriod down to ensure we don't exceed total amount
    const roundedAmountPerPeriod = Math.floor(amountPerPeriod)

    // calculate the remainder from rounding down
    const totalPeriodicAmount = roundedAmountPerPeriod * numberOfVestingPeriod
    const remainder =
        totalLockedVestingAmount - (cliffUnlockAmount + totalPeriodicAmount)

    // add the remainder to cliffUnlockAmount to maintain total amount
    const adjustedCliffUnlockAmount = cliffUnlockAmount + remainder

    let periodFrequency: BN
    if (activationType == ActivationType.Slot) {
        periodFrequency = new BN(totalVestingDuration / numberOfVestingPeriod)
            .div(new BN(TIMESTAMP_DURATION))
            .mul(new BN(SLOT_DURATION))
    } else {
        periodFrequency = new BN(totalVestingDuration / numberOfVestingPeriod)
    }

    return {
        amountPerPeriod: new BN(roundedAmountPerPeriod.toString()).mul(
            new BN(10).pow(new BN(tokenBaseDecimal))
        ),
        cliffDurationFromMigrationTime: new BN(cliffDurationFromMigrationTime),
        frequency: periodFrequency,
        numberOfPeriod: new BN(numberOfVestingPeriod),
        cliffUnlockAmount: new BN(adjustedCliffUnlockAmount.toString()).mul(
            new BN(10).pow(new BN(tokenBaseDecimal))
        ),
    }
}

/**
 * Get the two curve
 * @param migrationSqrPrice - The migration sqrt price
 * @param initialSqrtPrice - The initial sqrt price
 * @param swapAmount - The swap amount
 * @param migrationQuoteThreshold - The migration quote threshold
 * @returns The two curve
 */
export const getTwoCurve = (
    migrationSqrtPrice: BN,
    midSqrtPrice: BN,
    initialSqrtPrice: BN,
    swapAmount: BN,
    migrationQuoteThreshold: BN
) => {
    let p0 = new Decimal(initialSqrtPrice.toString())
    let p1 = new Decimal(midSqrtPrice.toString())
    let p2 = new Decimal(migrationSqrtPrice.toString())

    let a1 = new Decimal(1).div(p0).sub(new Decimal(1).div(p1))
    let b1 = new Decimal(1).div(p1).sub(new Decimal(1).div(p2))
    let c1 = new Decimal(swapAmount.toString())

    let a2 = p1.sub(p0)
    let b2 = p2.sub(p1)
    let c2 = new Decimal(migrationQuoteThreshold.toString()).mul(
        Decimal.pow(2, 128)
    )

    // solve equation to find l0 and l1
    let l0 = c1
        .mul(b2)
        .sub(c2.mul(b1))
        .div(a1.mul(b2).sub(a2.mul(b1)))
    let l1 = c1
        .mul(a2)
        .sub(c2.mul(a1))
        .div(b1.mul(a2).sub(b2.mul(a1)))

    if (l0.isNeg() || l1.isNeg()) {
        return {
            isOk: false,
            sqrtStartPrice: new BN(0),
            curve: [],
        }
    }

    return {
        isOk: true,
        sqrtStartPrice: initialSqrtPrice,
        curve: [
            {
                sqrtPrice: midSqrtPrice,
                liquidity: new BN(l0.floor().toFixed()),
            },
            {
                sqrtPrice: migrationSqrtPrice,
                liquidity: new BN(l1.floor().toFixed()),
            },
        ],
    }
}
