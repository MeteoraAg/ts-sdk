import {
    ActivationType,
    buildCurveWithMarketCap,
    CollectFeeMode,
    FeeSchedulerMode,
    getBaseFeeParams,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
} from '../src'
import { convertBNToDecimal } from './utils/common'
import { expect, test, describe } from 'bun:test'

describe('calculateFeeScheduler tests', () => {
    test('linear fee scheduler - should calculate parameters correctly', () => {
        const startingFeeBps = 5000
        const endingFeeBps = 1000
        const numberOfPeriod = 144
        const feeSchedulerMode = FeeSchedulerMode.Linear
        const totalDuration = 60

        const result = getBaseFeeParams(
            startingFeeBps,
            endingFeeBps,
            feeSchedulerMode,
            numberOfPeriod,
            totalDuration
        )

        console.log('result', convertBNToDecimal(result))

        // linear mode: cliffFeeNumerator - (numberOfPeriod * reductionFactor)
        expect(result.reductionFactor.toNumber()).toEqual(2777777)
    })

    test('exponential fee scheduler - should calculate parameters correctly', () => {
        const startingFeeBps = 5000
        const endingFeeBps = 100
        const numberOfPeriod = 100
        const feeSchedulerMode = FeeSchedulerMode.Exponential
        const totalDuration = 10 * 60 * 60

        const result = getBaseFeeParams(
            startingFeeBps,
            endingFeeBps,
            feeSchedulerMode,
            numberOfPeriod,
            totalDuration
        )

        console.log('result', convertBNToDecimal(result))

        // exponential mode: cliffFeeNumerator * (1 - reductionFactor/10_000)^numberOfPeriod
        // expect(result.reductionFactor.toNumber()).toEqual(420)
    })

    test('build curve with market cap - should calculate parameters correctly', () => {
        const curveConfig = buildCurveWithMarketCap({
            totalTokenSupply: 1000000000,
            initialMarketCap: 30000,
            migrationMarketCap: 100000,
            migrationOption: MigrationOption.MET_DAMM_V2,
            tokenBaseDecimal: TokenDecimal.SIX,
            tokenQuoteDecimal: TokenDecimal.NINE,
            lockedVestingParam: {
                totalLockedVestingAmount: 0,
                numberOfVestingPeriod: 0,
                cliffUnlockAmount: 0,
                totalVestingDuration: 0,
                cliffDurationFromMigrationTime: 0,
            },
            feeSchedulerParam: {
                startingFeeBps: 5000,
                endingFeeBps: 100,
                numberOfPeriod: 100,
                totalDuration: 10 * 60 * 60,
                feeSchedulerMode: FeeSchedulerMode.Exponential,
            },
            dynamicFeeEnabled: true,
            activationType: ActivationType.Slot,
            collectFeeMode: CollectFeeMode.OnlyQuote,
            migrationFeeOption: MigrationFeeOption.FixedBps100,
            tokenType: TokenType.SPL,
            partnerLpPercentage: 0,
            creatorLpPercentage: 0,
            partnerLockedLpPercentage: 50,
            creatorLockedLpPercentage: 50,
            creatorTradingFeePercentage: 50,
            leftover: 0,
        })

        console.log('curveConfig', convertBNToDecimal(curveConfig))
    })
})
