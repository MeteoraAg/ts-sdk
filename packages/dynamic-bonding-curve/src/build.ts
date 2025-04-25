import Decimal from 'decimal.js'
import BN from 'bn.js'
import {
    type ConfigParameters,
    type BuildCurveParam,
    BuildCurveByMarketCapParam,
} from './types'
import { MAX_SQRT_PRICE } from './constants'
import {
    getSqrtPriceFromPrice,
    getMigrationBaseToken,
    getTotalVestingAmount,
    getFirstCurve,
    getTotalSupplyFromCurve,
    getPercentageSupplyOnMigration,
    getMigrationQuoteThreshold,
} from './common'
import { getInitialLiquidityFromDeltaBase } from './math/curve'

/**
 * Build a custom constant product curve
 * @param buildCustomConstantProductCurveParam - The parameters for the custom constant product curve
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
        migrationOption
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
                cliffFeeNumerator: new BN((baseFeeBps * 100000).toString()),
                numberOfPeriod: numberOfPeriod,
                reductionFactor: new BN(reductionFactor),
                periodFrequency: new BN(periodFrequency),
                feeSchedulerMode: feeSchedulerMode,
            },
            dynamicFee: dynamicFeeEnabled
                ? {
                      binStep: 1,
                      binStepU128: new BN('1844674407370955'),
                      filterPeriod: 10,
                      decayPeriod: 120,
                      reductionFactor: 5000,
                      variableFeeControl: 2000000,
                      maxVolatilityAccumulator: 100000,
                  }
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
        padding: [],
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

    const percentageSupplyOnMigration = getPercentageSupplyOnMigration(
        new BN(initialMarketCap),
        new BN(migrationMarketCap),
        lockedVesting,
        new BN(totalTokenSupply)
    )

    const migrationQuoteThreshold = getMigrationQuoteThreshold(
        new BN(migrationMarketCap),
        percentageSupplyOnMigration
    )

    return buildCurve({
        ...buildCurveByMarketCapParam,
        percentageSupplyOnMigration,
        migrationQuoteThreshold,
    })
}
