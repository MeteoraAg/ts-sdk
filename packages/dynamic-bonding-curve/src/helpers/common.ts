import {
    ActivationType,
    BaseFee,
    BaseFeeConfig,
    DynamicFeeParameters,
    FeeSchedulerMode,
    FeeSchedulerParameters,
    MigrationOption,
    Rounding,
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
    OFFSET,
    ONE_Q64,
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
 * Calculate the percentage of supply that should be allocated to initial liquidity
 * @param initialMarketCap - The initial market cap
 * @param migrationMarketCap - The migration market cap
 * @param lockedVesting - The locked vesting
 * @param totalTokenSupply - The total token supply
 * @returns The percentage of supply for initial liquidity
 */
export const calculatePercentageSupplyOnMigration = (
    initialMarketCap: BN,
    migrationMarketCap: BN,
    lockedVesting: LockedVestingParameters,
    totalTokenSupply: BN
): number => {
    const initialMarketCapDecimal = new Decimal(initialMarketCap.toString())
    const migrationMarketCapDecimal = new Decimal(migrationMarketCap.toString())

    // formula: x = sqrt(initialMC / migrationMC) * (100 - z) / (1 + sqrt(initialMC / migrationMC))

    // sqrt(initial_MC / migration_MC)
    const marketCapRatio = initialMarketCapDecimal.div(
        migrationMarketCapDecimal
    )
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
export const calculateMigrationQuoteThreshold = (
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
 * Convert a decimal to a BN
 * @param value - The value
 * @returns The BN
 */
export function convertDecimalToBN(value: Decimal): BN {
    return new BN(value.floor().toFixed())
}

/**
 * Converts basis points (bps) to a fee numerator
 * 1 bps = 0.01% = 0.0001 in decimal
 *
 * @param bps - The value in basis points [1-10_000]
 * @returns The equivalent fee numerator
 */
export function bpsToFeeNumerator(bps: number): BN {
    return new BN(bps * FEE_DENOMINATOR).divn(BASIS_POINT_MAX)
}

/**
 * Converts a fee numerator back to basis points (bps)
 *
 * @param feeNumerator - The fee numerator to convert
 * @returns The equivalent value in basis points [1-10_000]
 */
export function feeNumeratorToBps(feeNumerator: BN): number {
    return feeNumerator
        .muln(BASIS_POINT_MAX)
        .div(new BN(FEE_DENOMINATOR))
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
    maxBaseFeeBps: number,
    minBaseFeeBps: number,
    feeSchedulerMode: FeeSchedulerMode,
    numberOfPeriod: number,
    totalDuration: number
): BaseFee {
    if (maxBaseFeeBps == minBaseFeeBps) {
        if (numberOfPeriod != 0 || totalDuration != 0) {
            throw new Error(
                'numberOfPeriod and totalDuration must both be zero'
            )
        }

        return {
            cliffFeeNumerator: bpsToFeeNumerator(maxBaseFeeBps),
            numberOfPeriod: 0,
            periodFrequency: new BN(0),
            reductionFactor: new BN(0),
            feeSchedulerMode: 0,
        }
    }

    if (numberOfPeriod <= 0) {
        throw new Error('Total periods must be greater than zero')
    }

    if (maxBaseFeeBps > feeNumeratorToBps(new BN(MAX_FEE_NUMERATOR))) {
        throw new Error(
            `maxBaseFeeBps (${maxBaseFeeBps} bps) exceeds maximum allowed value of ${feeNumeratorToBps(
                new BN(MAX_FEE_NUMERATOR)
            )} bps`
        )
    }

    if (minBaseFeeBps > maxBaseFeeBps) {
        throw new Error(
            'minBaseFee bps must be less than or equal to maxBaseFee bps'
        )
    }

    if (numberOfPeriod == 0 || totalDuration == 0) {
        throw new Error(
            'numberOfPeriod and totalDuration must both greater than zero'
        )
    }

    const maxBaseFeeNumerator = bpsToFeeNumerator(maxBaseFeeBps)

    const minBaseFeeNumerator = bpsToFeeNumerator(minBaseFeeBps)

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

// Fee scheduler
// Linear: cliffFeeNumerator - period * reductionFactor
// Exponential: cliffFeeNumerator * (1 -reductionFactor/BASIS_POINT_MAX)^period
export function getBaseFeeNumerator(
    feeSchedulerMode: FeeSchedulerMode,
    cliffFeeNumerator: BN,
    period: BN,
    reductionFactor: BN
): BN {
    let feeNumerator: BN
    if (feeSchedulerMode == FeeSchedulerMode.Linear) {
        feeNumerator = cliffFeeNumerator.sub(period.mul(reductionFactor))
    } else {
        const bps = reductionFactor.shln(OFFSET).div(new BN(BASIS_POINT_MAX))
        const base = ONE_Q64.sub(bps)
        const result = pow(base, period)
        feeNumerator = cliffFeeNumerator.mul(result).shrn(OFFSET)
    }

    return feeNumerator
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
 * Calculate the reduction factor for the fee scheduler based on starting and ending Bps
 * @param startingFeeBps - The starting fee in bps
 * @param endingFeeBps - The ending fee in bps
 * @param feeSchedulerMode - Linear or Exponential mode
 * @param numberOfPeriod - Total number of periods (depends on activation type, if slot - 400ms, if timestamp - 100ms)
 * @returns The Fee Scheduler Params
 */
export function calculateFeeScheduler(
    startingFeeBps: number,
    endingFeeBps: number,
    feeSchedulerMode: FeeSchedulerMode,
    numberOfPeriod: number
): {
    cliffFeeNumerator: BN
    numberOfPeriod: number
    periodFrequency: BN
    reductionFactor: BN
    feeSchedulerMode: FeeSchedulerMode
} {
    // convert fee from bps to fee numerator
    const cliffFeeNumerator = bpsToFeeNumerator(startingFeeBps)
    const endingFeeNumerator = bpsToFeeNumerator(endingFeeBps)

    if (feeSchedulerMode === FeeSchedulerMode.Linear) {
        // for linear mode: fee = cliff_fee_numerator - (period * reduction_factor)
        const totalReduction = cliffFeeNumerator.sub(endingFeeNumerator)
        const reductionFactor = totalReduction.div(new BN(numberOfPeriod))

        return {
            cliffFeeNumerator,
            numberOfPeriod,
            periodFrequency: new BN(1),
            reductionFactor,
            feeSchedulerMode: FeeSchedulerMode.Linear,
        }
    } else {
        // for exponential mode: fee = cliff_fee_numerator * (1 - reduction_factor/10_000)^period
        // calculate the decay rate needed to reach ending fee after numberOfPeriod periods
        const decayRate = Math.pow(
            endingFeeNumerator.toNumber() / cliffFeeNumerator.toNumber(),
            1 / numberOfPeriod
        )
        // convert decay rate to reduction factor (1 - decayRate) * 10000
        const reductionFactor = new BN(Math.floor((1 - decayRate) * 10000))

        return {
            cliffFeeNumerator,
            numberOfPeriod,
            periodFrequency: new BN(1),
            reductionFactor,
            feeSchedulerMode: FeeSchedulerMode.Exponential,
        }
    }
}
