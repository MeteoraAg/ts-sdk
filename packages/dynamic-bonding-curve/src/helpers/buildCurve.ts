import Decimal from 'decimal.js'
import BN from 'bn.js'
import {
    type ConfigParameters,
    type BuildCurveParam,
    BuildCurveByMarketCapParam,
    BuildCurveGraphParam,
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
export function buildCurveByMarketCap(
    buildCurveByMarketCapParam: BuildCurveByMarketCapParam
): ConfigParameters {
    const {
        initialMarketCap,
        migrationMarketCap,
        lockedVesting,
        totalTokenSupply,
    } = buildCurveByMarketCapParam

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
        ...buildCurveByMarketCapParam,
        percentageSupplyOnMigration,
        migrationQuoteThreshold,
    })
}

/**
 * Build a custom curve graph. Control the shape of the curve by liquidity weights.
 * @param buildCurveGraphParam - The parameters for the custom constant product curve by graph
 * @returns The build custom constant product curve by graph
 */
export function buildCurveGraph(
    buildCurveGraphParam: BuildCurveGraphParam
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
    } = buildCurveGraphParam

    const {
        numberOfPeriod,
        reductionFactor,
        periodFrequency,
        feeSchedulerMode,
    } = buildCurveGraphParam.feeSchedulerParam

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
