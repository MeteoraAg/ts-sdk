import Decimal from 'decimal.js'
import BN from 'bn.js'
import {
    type ConfigParameters,
    type BuildCurveParam,
    BuildCurveWithMarketCapParam,
    BuildCurveWithLiquidityWeightsParam,
    BuildCurveWithCreatorFirstBuyParam,
    BuildCurveWithTwoSegmentsParam,
} from '../types'
import { BASIS_POINT_MAX, FEE_DENOMINATOR, MAX_SQRT_PRICE } from '../constants'
import {
    getSqrtPriceFromPrice,
    getMigrationBaseToken,
    getTotalVestingAmount,
    getFirstCurve,
    getTotalSupplyFromCurve,
    calculatePercentageSupplyOnMigration,
    calculateMigrationQuoteThreshold,
    getSqrtPriceFromMarketCap,
    convertDecimalToBN,
    getBaseTokenForSwap,
    getSwapAmountWithBuffer,
    bpsToFeeNumerator,
    getDynamicFeeParams,
    getMinBaseFeeBps,
    getTwoCurve,
} from './common'
import { getInitialLiquidityFromDeltaBase } from '../math/curve'

/**
 * Build a custom constant product curve
 * @param buildCurveParam - The parameters for the custom constant product curve
 * @returns The build custom constant product curve
 */
export function buildCurve(buildCurveParam: BuildCurveParam): ConfigParameters {
    const {
        totalTokenSupply,
        percentageSupplyOnMigration,
        migrationQuoteThreshold,
        migrationOption,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        lockedVesting,
        baseFeeBps,
        dynamicFeeEnabled,
        activationType,
        collectFeeMode,
        migrationFeeOption,
        tokenType,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        creatorTradingFeePercentage,
        leftover,
    } = buildCurveParam

    const {
        numberOfPeriod,
        reductionFactor,
        periodFrequency,
        feeSchedulerMode,
    } = buildCurveParam.feeSchedulerParam

    const migrationBaseSupply = new BN(totalTokenSupply)
        .mul(new BN(percentageSupplyOnMigration))
        .div(new BN(100))

    const totalSupply = new BN(totalTokenSupply).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )

    const migrationQuoteThresholdWithDecimals = new BN(
        migrationQuoteThreshold * 10 ** tokenQuoteDecimal
    )

    const migrationPrice = new Decimal(migrationQuoteThreshold.toString()).div(
        new Decimal(migrationBaseSupply.toString())
    )

    const totalLeftover = new BN(leftover).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )

    const migrateSqrtPrice = getSqrtPriceFromPrice(
        migrationPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    const migrationBaseAmount = getMigrationBaseToken(
        new BN(migrationQuoteThresholdWithDecimals),
        migrateSqrtPrice,
        migrationOption
    )

    const totalVestingAmount = getTotalVestingAmount(lockedVesting)

    const swapAmount = totalSupply
        .sub(migrationBaseAmount)
        .sub(totalVestingAmount)
        .sub(totalLeftover)

    const { sqrtStartPrice, curve } = getFirstCurve(
        migrateSqrtPrice,
        migrationBaseAmount,
        swapAmount,
        migrationQuoteThresholdWithDecimals
    )

    const totalDynamicSupply = getTotalSupplyFromCurve(
        migrationQuoteThresholdWithDecimals,
        sqrtStartPrice,
        curve,
        lockedVesting,
        migrationOption,
        totalLeftover
    )

    const remainingAmount = totalSupply.sub(totalDynamicSupply)

    const lastLiquidity = getInitialLiquidityFromDeltaBase(
        remainingAmount,
        MAX_SQRT_PRICE,
        migrateSqrtPrice
    )

    if (!lastLiquidity.isZero()) {
        curve.push({
            sqrtPrice: MAX_SQRT_PRICE,
            liquidity: lastLiquidity,
        })
    }

    // Calculate minimum base fee for dynamic fee calculation
    let minBaseFeeBps = baseFeeBps
    if (periodFrequency > 0) {
        const cliffFeeNumerator =
            (baseFeeBps * FEE_DENOMINATOR) / BASIS_POINT_MAX

        minBaseFeeBps = getMinBaseFeeBps(
            cliffFeeNumerator,
            numberOfPeriod,
            reductionFactor,
            feeSchedulerMode
        )
    }

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                cliffFeeNumerator: bpsToFeeNumerator(baseFeeBps),
                numberOfPeriod: numberOfPeriod,
                reductionFactor: new BN(reductionFactor),
                periodFrequency: new BN(periodFrequency),
                feeSchedulerMode: feeSchedulerMode,
            },
            dynamicFee: dynamicFeeEnabled
                ? getDynamicFeeParams(minBaseFeeBps)
                : null,
        },
        activationType: activationType,
        collectFeeMode: collectFeeMode,
        migrationOption: migrationOption,
        tokenType: tokenType,
        tokenDecimal: tokenBaseDecimal,
        migrationQuoteThreshold: migrationQuoteThresholdWithDecimals,
        partnerLpPercentage: partnerLpPercentage,
        creatorLpPercentage: creatorLpPercentage,
        partnerLockedLpPercentage: partnerLockedLpPercentage,
        creatorLockedLpPercentage: creatorLockedLpPercentage,
        sqrtStartPrice,
        lockedVesting,
        migrationFeeOption: migrationFeeOption,
        tokenSupply: {
            preMigrationTokenSupply: totalSupply,
            postMigrationTokenSupply: totalSupply,
        },
        creatorTradingFeePercentage,
        padding0: [],
        padding1: [],
        curve,
    }
    return instructionParams
}

/**
 * Build a custom constant product curve by market cap
 * @param buildCurveByMarketCapParam - The parameters for the custom constant product curve by market cap
 * @returns The build custom constant product curve by market cap
 */
export function buildCurveWithMarketCap(
    buildCurveWithMarketCapParam: BuildCurveWithMarketCapParam
): ConfigParameters {
    const {
        initialMarketCap,
        migrationMarketCap,
        lockedVesting,
        totalTokenSupply,
    } = buildCurveWithMarketCapParam

    const percentageSupplyOnMigration = calculatePercentageSupplyOnMigration(
        new BN(initialMarketCap),
        new BN(migrationMarketCap),
        lockedVesting,
        new BN(totalTokenSupply)
    )

    const migrationQuoteThreshold = calculateMigrationQuoteThreshold(
        new BN(migrationMarketCap),
        percentageSupplyOnMigration
    )

    return buildCurve({
        ...buildCurveWithMarketCapParam,
        percentageSupplyOnMigration,
        migrationQuoteThreshold,
    })
}

/**
 * Build a custom constant product curve by market cap
 * @param buildCurveWithTwoSegmentsParam - The parameters for the custom constant product curve by market cap
 * @returns The build custom constant product curve by market cap
 */
export function buildCurveWithTwoSegments(
    buildCurveWithTwoSegmentsParam: BuildCurveWithTwoSegmentsParam
): ConfigParameters {
    const {
        totalTokenSupply,
        initialMarketCap,
        migrationMarketCap,
        percentageSupplyOnMigration,
        migrationOption,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        creatorTradingFeePercentage,
        collectFeeMode,
        lockedVesting,
        leftover,
        tokenType,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        activationType,
        baseFeeBps,
        dynamicFeeEnabled,
        migrationFeeOption,
    } = buildCurveWithTwoSegmentsParam

    const {
        numberOfPeriod,
        reductionFactor,
        periodFrequency,
        feeSchedulerMode,
    } = buildCurveWithTwoSegmentsParam.feeSchedulerParam

    let migrationBaseSupply = new BN(totalTokenSupply)
        .mul(new BN(percentageSupplyOnMigration))
        .div(new BN(100))

    let totalSupply = new BN(totalTokenSupply).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )

    // migrationQuoteThreshold = migrationMarketCap * migrationBaseSupply / totalTokenSupply
    let migrationQuoteThreshold = calculateMigrationQuoteThreshold(
        new BN(migrationMarketCap),
        percentageSupplyOnMigration
    )

    let migrationQuoteThresholdWithDecimals = new BN(
        migrationQuoteThreshold * 10 ** tokenQuoteDecimal
    )

    let migrationPrice = new Decimal(migrationQuoteThreshold.toString()).div(
        new Decimal(migrationBaseSupply.toString())
    )
    let migrateSqrtPrice = getSqrtPriceFromPrice(
        migrationPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    let migrationBaseAmount = getMigrationBaseToken(
        new BN(migrationQuoteThresholdWithDecimals),
        migrateSqrtPrice,
        migrationOption
    )

    let totalVestingAmount = getTotalVestingAmount(lockedVesting)

    let totalLeftover = new BN(leftover * 10 ** tokenBaseDecimal)
    let swapAmount = totalSupply
        .sub(migrationBaseAmount)
        .sub(totalVestingAmount)
        .sub(totalLeftover)

    let initialSqrtPrice = getSqrtPriceFromMarketCap(
        initialMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    let { sqrtStartPrice, curve } = getTwoCurve(
        migrateSqrtPrice,
        initialSqrtPrice,
        swapAmount,
        migrationQuoteThresholdWithDecimals
    )

    let totalDynamicSupply = getTotalSupplyFromCurve(
        migrationQuoteThresholdWithDecimals,
        sqrtStartPrice,
        curve,
        lockedVesting,
        migrationOption,
        totalLeftover
    )

    if (totalDynamicSupply.gt(totalSupply)) {
        // precision loss is used for leftover
        let leftOverDelta = totalDynamicSupply.sub(totalSupply)
        if (!leftOverDelta.lt(totalLeftover)) {
            throw new Error('leftOverDelta must be less than totalLeftover')
        }
    }

    // Calculate minimum base fee for dynamic fee calculation
    let minBaseFeeBps = baseFeeBps
    if (periodFrequency > 0) {
        const cliffFeeNumerator =
            (baseFeeBps * FEE_DENOMINATOR) / BASIS_POINT_MAX

        minBaseFeeBps = getMinBaseFeeBps(
            cliffFeeNumerator,
            numberOfPeriod,
            reductionFactor,
            feeSchedulerMode
        )
    }

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                cliffFeeNumerator: bpsToFeeNumerator(baseFeeBps),
                numberOfPeriod: numberOfPeriod,
                reductionFactor: new BN(reductionFactor),
                periodFrequency: new BN(periodFrequency),
                feeSchedulerMode: feeSchedulerMode,
            },
            dynamicFee: dynamicFeeEnabled
                ? getDynamicFeeParams(minBaseFeeBps)
                : null,
        },
        activationType,
        collectFeeMode,
        migrationOption,
        tokenType,
        tokenDecimal: tokenBaseDecimal,
        migrationQuoteThreshold: migrationQuoteThresholdWithDecimals,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        sqrtStartPrice,
        lockedVesting,
        migrationFeeOption,
        tokenSupply: {
            preMigrationTokenSupply: totalSupply,
            postMigrationTokenSupply: totalSupply,
        },
        creatorTradingFeePercentage,
        padding0: [],
        padding1: [],
        curve,
    }
    return instructionParams
}

/**
 * Build a custom curve graph with liquidity weights, changing the curve shape based on the liquidity weights
 * @param buildCurveWithLiquidityWeightsParam - The parameters for the custom constant product curve with liquidity weights
 * @returns The build custom constant product curve with liquidity weights
 */
export function buildCurveWithLiquidityWeights(
    buildCurveWithLiquidityWeightsParam: BuildCurveWithLiquidityWeightsParam
): ConfigParameters {
    const {
        totalTokenSupply,
        migrationOption,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        lockedVesting,
        baseFeeBps,
        dynamicFeeEnabled,
        activationType,
        collectFeeMode,
        migrationFeeOption,
        tokenType,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        creatorTradingFeePercentage,
        leftover,
        initialMarketCap,
        migrationMarketCap,
        liquidityWeights,
    } = buildCurveWithLiquidityWeightsParam

    const {
        numberOfPeriod,
        reductionFactor,
        periodFrequency,
        feeSchedulerMode,
    } = buildCurveWithLiquidityWeightsParam.feeSchedulerParam

    // 1. finding Pmax and Pmin
    let pMin = getSqrtPriceFromMarketCap(
        initialMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )
    let pMax = getSqrtPriceFromMarketCap(
        migrationMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    // find q^16 = pMax / pMin
    let priceRatio = new Decimal(pMax.toString()).div(
        new Decimal(pMin.toString())
    )
    let qDecimal = priceRatio.pow(new Decimal(1).div(new Decimal(16)))

    // finding all prices
    let sqrtPrices = []
    let currentPrice = pMin
    for (let i = 0; i < 17; i++) {
        sqrtPrices.push(currentPrice)
        currentPrice = convertDecimalToBN(
            qDecimal.mul(new Decimal(currentPrice.toString()))
        )
    }

    let totalSupply = new BN(totalTokenSupply).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )
    let totalLeftover = new BN(leftover).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )
    let totalVestingAmount = getTotalVestingAmount(lockedVesting)

    let totalSwapAndMigrationAmount = totalSupply
        .sub(totalVestingAmount)
        .sub(totalLeftover)

    let sumFactor = new Decimal(0)
    let pmaxWeight = new Decimal(pMax.toString())
    for (let i = 1; i < 17; i++) {
        let pi = new Decimal(sqrtPrices[i].toString())
        let piMinus = new Decimal(sqrtPrices[i - 1].toString())
        let k = new Decimal(liquidityWeights[i - 1])
        let w1 = pi.sub(piMinus).div(pi.mul(piMinus))
        let w2 = pi.sub(piMinus).div(pmaxWeight.mul(pmaxWeight))
        let weight = k.mul(w1.add(w2))
        sumFactor = sumFactor.add(weight)
    }

    let l1 = new Decimal(totalSwapAndMigrationAmount.toString()).div(sumFactor)

    // construct curve
    let curve = []
    for (let i = 0; i < 16; i++) {
        let k = new Decimal(liquidityWeights[i])
        let liquidity = convertDecimalToBN(l1.mul(k))
        let sqrtPrice = i < 15 ? sqrtPrices[i + 1] : pMax
        curve.push({
            sqrtPrice,
            liquidity,
        })
    }
    // reverse to calculate swap amount and migration amount
    let swapBaseAmount = getBaseTokenForSwap(pMin, pMax, curve)
    let swapBaseAmountBuffer = getSwapAmountWithBuffer(
        swapBaseAmount,
        pMin,
        curve
    )

    let migrationAmount = totalSwapAndMigrationAmount.sub(swapBaseAmountBuffer)
    // let percentage = migrationAmount.mul(new BN(100)).div(totalSupply)

    // calculate migration threshold
    let migrationQuoteThreshold = migrationAmount.mul(pMax).mul(pMax).shrn(128)

    // sanity check
    let totalDynamicSupply = getTotalSupplyFromCurve(
        migrationQuoteThreshold,
        pMin,
        curve,
        lockedVesting,
        migrationOption,
        totalLeftover
    )

    if (totalDynamicSupply.gt(totalSupply)) {
        // precision loss is used for leftover
        let leftOverDelta = totalDynamicSupply.sub(totalSupply)
        if (!leftOverDelta.lt(totalLeftover)) {
            throw new Error('leftOverDelta must be less than totalLeftover')
        }
    }

    // Calculate minimum base fee for dynamic fee calculation
    let minBaseFeeBps = baseFeeBps
    if (periodFrequency > 0) {
        const cliffFeeNumerator =
            (baseFeeBps * FEE_DENOMINATOR) / BASIS_POINT_MAX

        minBaseFeeBps = getMinBaseFeeBps(
            cliffFeeNumerator,
            numberOfPeriod,
            reductionFactor,
            feeSchedulerMode
        )
    }

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                cliffFeeNumerator: bpsToFeeNumerator(baseFeeBps),
                numberOfPeriod: numberOfPeriod,
                reductionFactor: new BN(reductionFactor),
                periodFrequency: new BN(periodFrequency),
                feeSchedulerMode: feeSchedulerMode,
            },
            dynamicFee: dynamicFeeEnabled
                ? getDynamicFeeParams(minBaseFeeBps)
                : null,
        },
        activationType: activationType,
        collectFeeMode: collectFeeMode,
        migrationOption: migrationOption,
        tokenType: tokenType,
        tokenDecimal: tokenBaseDecimal,
        migrationQuoteThreshold,
        partnerLpPercentage: partnerLpPercentage,
        creatorLpPercentage: creatorLpPercentage,
        partnerLockedLpPercentage: partnerLockedLpPercentage,
        creatorLockedLpPercentage: creatorLockedLpPercentage,
        sqrtStartPrice: pMin,
        lockedVesting,
        migrationFeeOption: migrationFeeOption,
        tokenSupply: {
            preMigrationTokenSupply: totalSupply,
            postMigrationTokenSupply: totalSupply,
        },
        creatorTradingFeePercentage,
        padding0: [],
        padding1: [],
        curve,
    }
    return instructionParams
}

/**
 * Build a custom curve with creator first buy (must be in collect fee mode == 0)
 * @param buildCurveWithCreatorFirstBuyParam - The parameters for the custom constant product curve with creator first buy
 * @returns The build custom constant product curve with creator first buy
 */
export function buildCurveWithCreatorFirstBuy(
    buildCurveWithCreatorFirstBuyParam: BuildCurveWithCreatorFirstBuyParam
): ConfigParameters {
    const {
        totalTokenSupply,
        migrationOption,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        lockedVesting,
        baseFeeBps,
        dynamicFeeEnabled,
        activationType,
        collectFeeMode,
        migrationFeeOption,
        tokenType,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        creatorTradingFeePercentage,
        leftover,
        initialMarketCap,
        migrationMarketCap,
        liquidityWeights,
    } = buildCurveWithCreatorFirstBuyParam

    const { quoteAmount, baseAmount } =
        buildCurveWithCreatorFirstBuyParam.creatorFirstBuyOption

    const {
        numberOfPeriod,
        reductionFactor,
        periodFrequency,
        feeSchedulerMode,
    } = buildCurveWithCreatorFirstBuyParam.feeSchedulerParam

    // find Pmax and Pmin
    let pMin = getSqrtPriceFromMarketCap(
        initialMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )
    let pMax = getSqrtPriceFromMarketCap(
        migrationMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    // find p0 (initial price of curve)
    let firstBuyQuoteAmount = new BN(quoteAmount * 10 ** tokenQuoteDecimal)
    let firstBuyBaseAmount = new BN(baseAmount * 10 ** tokenBaseDecimal)

    const cliffFeeNumerator = bpsToFeeNumerator(baseFeeBps)
    let quoteAmountAfterFee = firstBuyQuoteAmount
        .mul(new BN(1_000_000_000).sub(cliffFeeNumerator))
        .div(new BN(1_000_000_000))

    let p0 = quoteAmountAfterFee.shln(128).div(firstBuyBaseAmount).div(pMin)
    let l0 = quoteAmountAfterFee.shln(128).div(pMin.sub(p0))

    if (pMin.lt(p0)) {
        throw Error('first price is greater than initial market cap')
    }

    // construct first curve
    let curve = [
        {
            sqrtPrice: pMin,
            liquidity: l0,
        },
    ]

    // find q^15 = pMax / pMin
    let priceRatio = new Decimal(pMax.toString()).div(
        new Decimal(pMin.toString())
    )
    let qDecimal = priceRatio.pow(new Decimal(1).div(new Decimal(15)))

    // finding all prices
    let sqrtPrices = []
    let currentPrice = pMin
    for (let i = 0; i < 16; i++) {
        sqrtPrices.push(currentPrice)
        currentPrice = convertDecimalToBN(
            qDecimal.mul(new Decimal(currentPrice.toString()))
        )
    }

    let totalSupply = new BN(totalTokenSupply).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )
    let totalLeftover = new BN(leftover).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )
    let totalVestingAmount = getTotalVestingAmount(lockedVesting)

    let totalSwapAndMigrationAmount = totalSupply
        .sub(totalVestingAmount)
        .sub(totalLeftover)
    let totalSwapAndMigrationAmountAfterFirstBuyAmount =
        totalSwapAndMigrationAmount.sub(firstBuyBaseAmount)

    let sumFactor = new Decimal(0)
    let pmaxWeight = new Decimal(pMax.toString())
    for (let i = 1; i < 16; i++) {
        let pi = new Decimal(sqrtPrices[i].toString())
        let piMinus = new Decimal(sqrtPrices[i - 1].toString())
        let k = new Decimal(liquidityWeights[i - 1])
        let w1 = pi.sub(piMinus).div(pi.mul(piMinus))
        let w2 = pi.sub(piMinus).div(pmaxWeight.mul(pmaxWeight))
        let weight = k.mul(w1.add(w2))
        sumFactor = sumFactor.add(weight)
    }

    let l1 = new Decimal(
        totalSwapAndMigrationAmountAfterFirstBuyAmount.toString()
    ).div(sumFactor)

    // construct remaining curve
    for (let i = 0; i < 15; i++) {
        let k = new Decimal(liquidityWeights[i])
        let liquidity = convertDecimalToBN(l1.mul(k))
        let sqrtPrice = i < 15 ? sqrtPrices[i + 1] : pMax
        curve.push({
            sqrtPrice,
            liquidity,
        })
    }
    // reverse to calculate swap amount and migration amount
    let swapBaseAmount = getBaseTokenForSwap(p0, pMax, curve)
    let swapBaseAmountBuffer = getSwapAmountWithBuffer(
        swapBaseAmount,
        p0,
        curve
    )

    let migrationAmount = totalSwapAndMigrationAmount.sub(swapBaseAmountBuffer)
    // let percentage = migrationAmount.mul(new BN(100)).div(totalSupply)

    // calculate migration threshold
    let migrationQuoteThreshold = migrationAmount.mul(pMax).mul(pMax).shrn(128)

    // sanity check
    let totalDynamicSupply = getTotalSupplyFromCurve(
        migrationQuoteThreshold,
        p0,
        curve,
        lockedVesting,
        migrationOption,
        totalLeftover
    )

    if (totalDynamicSupply.gt(totalSupply)) {
        // precision loss is used for leftover
        let leftOverDelta = totalDynamicSupply.sub(totalSupply)
        if (!leftOverDelta.lt(totalLeftover)) {
            throw new Error('leftOverDelta must be less than totalLeftover')
        }
    }

    // Calculate minimum base fee for dynamic fee calculation
    let minBaseFeeBps = baseFeeBps
    if (periodFrequency > 0) {
        const cliffFeeNumerator =
            (baseFeeBps * FEE_DENOMINATOR) / BASIS_POINT_MAX

        minBaseFeeBps = getMinBaseFeeBps(
            cliffFeeNumerator,
            numberOfPeriod,
            reductionFactor,
            feeSchedulerMode
        )
    }

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                cliffFeeNumerator,
                numberOfPeriod: 0,
                reductionFactor: new BN(0),
                periodFrequency: new BN(0),
                feeSchedulerMode: 0,
            },
            dynamicFee: dynamicFeeEnabled
                ? getDynamicFeeParams(minBaseFeeBps)
                : null,
        },
        activationType,
        collectFeeMode,
        migrationOption,
        tokenType,
        tokenDecimal: tokenBaseDecimal,
        migrationQuoteThreshold,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        sqrtStartPrice: p0,
        lockedVesting,
        migrationFeeOption,
        tokenSupply: {
            preMigrationTokenSupply: totalSupply,
            postMigrationTokenSupply: totalSupply,
        },
        creatorTradingFeePercentage,
        padding0: [],
        padding1: [],
        curve,
    }
    return instructionParams
}
