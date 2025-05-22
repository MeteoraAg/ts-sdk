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
import { FEE_DENOMINATOR, MAX_SQRT_PRICE } from '../constants'
import {
    getSqrtPriceFromPrice,
    getMigrationBaseToken,
    getTotalVestingAmount,
    getFirstCurve,
    getTotalSupplyFromCurve,
    getPercentageSupplyOnMigration,
    getMigrationQuoteThreshold,
    getSqrtPriceFromMarketCap,
    getBaseTokenForSwap,
    getSwapAmountWithBuffer,
    getDynamicFeeParams,
    getTwoCurve,
    getBaseFeeParams,
    getLockedVestingParams,
} from './common'
import { getInitialLiquidityFromDeltaBase } from '../math/curve'
import { bpsToFeeNumerator, convertDecimalToBN } from './utils'

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
        startingFeeBps,
        endingFeeBps,
        numberOfPeriod,
        feeSchedulerMode,
        totalDuration,
    } = buildCurveParam.feeSchedulerParam

    const baseFeeParams = getBaseFeeParams(
        startingFeeBps,
        endingFeeBps,
        feeSchedulerMode,
        numberOfPeriod,
        totalDuration
    )

    const {
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
    } = buildCurveParam.lockedVestingParam

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal,
        activationType
    )

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

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                ...baseFeeParams,
            },
            dynamicFee: dynamicFeeEnabled
                ? getDynamicFeeParams(endingFeeBps)
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
        totalTokenSupply,
        activationType,
        tokenBaseDecimal,
    } = buildCurveWithMarketCapParam

    const {
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
    } = buildCurveWithMarketCapParam.lockedVestingParam

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal,
        activationType
    )

    const totalSupply = new BN(totalTokenSupply).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )

    const percentageSupplyOnMigration = getPercentageSupplyOnMigration(
        new BN(initialMarketCap),
        new BN(migrationMarketCap),
        lockedVesting,
        totalSupply
    )

    const migrationQuoteThreshold = getMigrationQuoteThreshold(
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
        leftover,
        tokenType,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        activationType,
        dynamicFeeEnabled,
        migrationFeeOption,
    } = buildCurveWithTwoSegmentsParam

    const {
        startingFeeBps,
        endingFeeBps,
        numberOfPeriod,
        feeSchedulerMode,
        totalDuration,
    } = buildCurveWithTwoSegmentsParam.feeSchedulerParam

    const baseFeeParams = getBaseFeeParams(
        startingFeeBps,
        endingFeeBps,
        feeSchedulerMode,
        numberOfPeriod,
        totalDuration
    )

    const {
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
    } = buildCurveWithTwoSegmentsParam.lockedVestingParam

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal,
        activationType
    )

    let migrationBaseSupply = new BN(totalTokenSupply)
        .mul(new BN(percentageSupplyOnMigration))
        .div(new BN(100))

    let totalSupply = new BN(totalTokenSupply).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )

    // migrationMarketCap * migrationBaseSupply / totalTokenSupply
    let migrationQuoteThreshold =
        (migrationMarketCap * percentageSupplyOnMigration) / 100

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

    let totalLeftover = new BN(leftover).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )

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

    // instantiate midSqrtPriceDecimal1
    let midSqrtPriceDecimal1 = new Decimal(migrateSqrtPrice.toString())
        .mul(new Decimal(initialSqrtPrice.toString()))
        .sqrt()
    let midSqrtPrice1 = new BN(midSqrtPriceDecimal1.floor().toFixed())

    // instantiate midSqrtPriceDecimal2
    let midSqrtPriceDecimal2 = new Decimal(migrateSqrtPrice.toString())
        .pow(new Decimal(3))
        .mul(new Decimal(initialSqrtPrice.toString()).pow(0.25))
    let midSqrtPrice2 = new BN(midSqrtPriceDecimal2.floor().toFixed())

    // instantiate midSqrtPriceDecimal3
    let midSqrtPriceDecimal3 = new Decimal(migrateSqrtPrice.toString()).mul(
        new Decimal(initialSqrtPrice.toString()).pow(new Decimal(3)).pow(0.25)
    )
    let midSqrtPrice3 = new BN(midSqrtPriceDecimal3.floor().toFixed())

    let midPrices = [midSqrtPrice1, midSqrtPrice2, midSqrtPrice3]
    let sqrtStartPrice = new BN(0)
    let curve: { sqrtPrice: BN; liquidity: BN }[] = []
    for (let i = 0; i < midPrices.length; i++) {
        const result = getTwoCurve(
            migrateSqrtPrice,
            midPrices[i],
            initialSqrtPrice,
            swapAmount,
            migrationQuoteThresholdWithDecimals
        )
        if (result.isOk) {
            curve = result.curve
            sqrtStartPrice = result.sqrtStartPrice
            break
        }
    }

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

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                ...baseFeeParams,
            },
            dynamicFee: dynamicFeeEnabled
                ? getDynamicFeeParams(endingFeeBps)
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
        startingFeeBps,
        endingFeeBps,
        numberOfPeriod,
        feeSchedulerMode,
        totalDuration,
    } = buildCurveWithLiquidityWeightsParam.feeSchedulerParam

    const baseFeeParams = getBaseFeeParams(
        startingFeeBps,
        endingFeeBps,
        feeSchedulerMode,
        numberOfPeriod,
        totalDuration
    )

    const {
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
    } = buildCurveWithLiquidityWeightsParam.lockedVestingParam

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal,
        activationType
    )

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

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                ...baseFeeParams,
            },
            dynamicFee: dynamicFeeEnabled
                ? getDynamicFeeParams(endingFeeBps)
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
        startingFeeBps,
        endingFeeBps,
        numberOfPeriod,
        feeSchedulerMode,
        totalDuration,
    } = buildCurveWithCreatorFirstBuyParam.feeSchedulerParam

    const baseFeeParams = getBaseFeeParams(
        startingFeeBps,
        endingFeeBps,
        feeSchedulerMode,
        numberOfPeriod,
        totalDuration
    )

    const {
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
    } = buildCurveWithCreatorFirstBuyParam.lockedVestingParam

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal,
        activationType
    )

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

    const cliffFeeNumerator = bpsToFeeNumerator(startingFeeBps)
    let quoteAmountAfterFee = firstBuyQuoteAmount
        .mul(new BN(FEE_DENOMINATOR).sub(cliffFeeNumerator))
        .div(new BN(FEE_DENOMINATOR))

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

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                ...baseFeeParams,
            },
            dynamicFee: dynamicFeeEnabled
                ? getDynamicFeeParams(endingFeeBps)
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
