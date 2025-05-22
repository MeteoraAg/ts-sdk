import { expect, test, describe } from 'bun:test'
import {
    buildCurve,
    buildCurveWithMarketCap,
    buildCurveWithCreatorFirstBuy,
    buildCurveWithLiquidityWeights,
    buildCurveWithTwoSegments,
    getTotalVestingAmount,
    getLockedVestingParams,
} from '../src/helpers'
import BN from 'bn.js'
import {
    ActivationType,
    CollectFeeMode,
    FeeSchedulerMode,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
} from '../src'
import Decimal from 'decimal.js'
import { convertBNToDecimal } from './utils/common'

describe('buildCurve tests', () => {
    const baseParams = {
        totalTokenSupply: 1000000000,
        migrationOption: MigrationOption.MET_DAMM_V2,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        lockedVestingParam: {
            totalLockedVestingAmount: 0,
            amountPerVestingPeriod: 0,
            numberOfVestingPeriod: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
        },
        feeSchedulerParam: {
            startingFeeBps: 100,
            endingFeeBps: 100,
            numberOfPeriod: 0,
            totalDuration: 0,
            feeSchedulerMode: FeeSchedulerMode.Linear,
        },
        dynamicFeeEnabled: true,
        activationType: ActivationType.Slot,
        collectFeeMode: CollectFeeMode.OnlyQuote,
        migrationFeeOption: MigrationFeeOption.FixedBps100,
        tokenType: TokenType.SPL,
        partnerLpPercentage: 0,
        creatorLpPercentage: 0,
        partnerLockedLpPercentage: 100,
        creatorLockedLpPercentage: 0,
        creatorTradingFeePercentage: 0,
        leftover: 10000,
    }

    test('build curve with percentage and threshold parameters', () => {
        console.log(
            '\n testing build curve with percentage and threshold parameters...'
        )
        const config = buildCurve({
            ...baseParams,
            percentageSupplyOnMigration: 2.983257229832572,
            migrationQuoteThreshold: 95.07640791476408,
        })

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })

    test('build curve by market cap', () => {
        console.log('\n testing build curve by market cap...')
        const config = buildCurveWithMarketCap({
            ...baseParams,
            initialMarketCap: 23.5,
            migrationMarketCap: 405.882352941,
        })

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })

    test('build curve by market cap with locked vesting', () => {
        console.log('\n testing build curve with locked vesting...')
        const lockedVestingParams = {
            ...baseParams,
            initialMarketCap: 99.1669972233,
            migrationMarketCap: 462.779320376,
            lockedVestingParam: {
                totalLockedVestingAmount: 10000000,
                amountPerVestingPeriod: 2000,
                numberOfVestingPeriod: 1000,
                totalVestingDuration: 365 * 24 * 60 * 60,
                cliffDurationFromMigrationTime: 0,
            },
        }

        const config = buildCurveWithMarketCap(lockedVestingParams)

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()

        const lockedVesting = getLockedVestingParams(
            lockedVestingParams.lockedVestingParam.totalLockedVestingAmount,
            lockedVestingParams.lockedVestingParam.numberOfVestingPeriod,
            lockedVestingParams.lockedVestingParam.amountPerVestingPeriod,
            lockedVestingParams.lockedVestingParam.totalVestingDuration,
            lockedVestingParams.lockedVestingParam
                .cliffDurationFromMigrationTime,
            lockedVestingParams.tokenBaseDecimal
        )

        const totalVestingAmount = getTotalVestingAmount(lockedVesting)
        const vestingPercentage = totalVestingAmount
            .mul(new BN(100))
            .div(
                new BN(
                    lockedVestingParams.totalTokenSupply *
                        10 ** lockedVestingParams.tokenBaseDecimal
                )
            )
            .toNumber()

        expect(config.tokenSupply).not.toBeNull()
        if (config.tokenSupply) {
            expect(config.tokenSupply.preMigrationTokenSupply).toBeDefined()
            expect(config.tokenSupply.postMigrationTokenSupply).toBeDefined()

            const migrationPercentage = config.migrationQuoteThreshold
                .mul(new BN(100))
                .div(config.tokenSupply.preMigrationTokenSupply)
                .toNumber()

            expect(migrationPercentage).toBeLessThan(100 - vestingPercentage)
        }
    })

    test('build curve with liquidity weights 1.2^n', () => {
        console.log('\n testing build curve with liquidity weights 1.2^n...')
        let liquidityWeights: number[] = []
        for (let i = 0; i < 16; i++) {
            liquidityWeights[i] = new Decimal(1.2)
                .pow(new Decimal(i))
                .toNumber()
        }

        console.log('liquidityWeights:', liquidityWeights)

        const curveGraphParams = {
            ...baseParams,
            initialMarketCap: 30,
            migrationMarketCap: 300,
            liquidityWeights,
        }

        const config = buildCurveWithLiquidityWeights(curveGraphParams)

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })

    test('build curve with liquidity weights 0.6^n', () => {
        console.log('\n testing build curve with liquidity weights 0.6^n...')
        let liquidityWeights: number[] = []
        for (let i = 0; i < 16; i++) {
            liquidityWeights[i] = new Decimal(0.6)
                .pow(new Decimal(i))
                .toNumber()
        }

        const curveGraphParams = {
            ...baseParams,
            initialMarketCap: 30,
            migrationMarketCap: 300,
            liquidityWeights,
        }

        const config = buildCurveWithLiquidityWeights(curveGraphParams)

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })

    test('build curve with liquidity weights v1', () => {
        console.log('\n testing build curve with liquidity weights v1...')
        let liquidityWeights: number[] = []
        for (let i = 0; i < 16; i++) {
            if (i < 15) {
                liquidityWeights[i] = new Decimal(1.2)
                    .pow(new Decimal(i))
                    .toNumber()
            } else {
                liquidityWeights[i] = 80
            }
        }

        console.log('liquidityWeights:', liquidityWeights)

        const curveGraphParams = {
            ...baseParams,
            totalTokenSupply: 1000000000,
            initialMarketCap: 15,
            migrationMarketCap: 255,
            tokenQuoteDecimal: TokenDecimal.SIX,
            tokenBaseDecimal: TokenDecimal.NINE,
            lockedVestingParam: {
                totalLockedVestingAmount: 10000000,
                amountPerVestingPeriod: 10000000,
                numberOfVestingPeriod: 1,
                totalVestingDuration: 1,
                cliffDurationFromMigrationTime: 0,
            },
            leftover: 200000000,
            liquidityWeights,
            migrationOption: MigrationOption.MET_DAMM,
        }

        const config = buildCurveWithLiquidityWeights(curveGraphParams)

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.SIX))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })

    test('build curve with liquidity weights v2', () => {
        console.log('\n testing build curve with liquidity weights v2...')

        const liquidityWeights = [
            0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24,
            20.48, 40.96, 81.92, 163.84, 327.68,
        ]

        console.log('liquidityWeights:', liquidityWeights)

        const curveGraphParams = {
            ...baseParams,
            totalTokenSupply: 100000000,
            initialMarketCap: 50,
            migrationMarketCap: 100000,
            tokenQuoteDecimal: TokenDecimal.SIX,
            tokenBaseDecimal: TokenDecimal.SIX,
            leftover: 50000000,
            liquidityWeights,
            migrationOption: MigrationOption.MET_DAMM,
        }

        const config = buildCurveWithLiquidityWeights(curveGraphParams)

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.SIX))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })

    test('build curve with creator first buy', () => {
        console.log('\n testing build curve with creator first buy...')

        let liquidityWeights: number[] = []
        for (let i = 0; i < 16; i++) {
            if (i < 15) {
                liquidityWeights[i] = new Decimal(1.45)
                    .pow(new Decimal(i))
                    .toNumber()
            } else {
                liquidityWeights[i] = 90
            }
        }
        console.log('liquidityWeights:', liquidityWeights)

        const curveGraphParams = {
            ...baseParams,
            totalTokenSupply: 1000000000,
            initialMarketCap: 15,
            migrationMarketCap: 255,
            tokenQuoteDecimal: TokenDecimal.NINE,
            tokenBaseDecimal: TokenDecimal.SIX,
            leftover: 200000000,
            liquidityWeights,
            migrationOption: MigrationOption.MET_DAMM,
            creatorFirstBuyOption: {
                quoteAmount: 0.01,
                baseAmount: 10000000,
            },
        }

        const config = buildCurveWithCreatorFirstBuy(curveGraphParams)

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })

    test('build curve with two segments', () => {
        console.log('\n testing build curve with two segments...')

        const config = buildCurveWithTwoSegments({
            totalTokenSupply: 1000000000,
            initialMarketCap: 200000,
            migrationMarketCap: 1000000,
            percentageSupplyOnMigration: 20,
            migrationOption: MigrationOption.MET_DAMM_V2,
            tokenBaseDecimal: TokenDecimal.NINE,
            tokenQuoteDecimal: TokenDecimal.NINE,
            lockedVestingParam: {
                totalLockedVestingAmount: 0,
                amountPerVestingPeriod: 0,
                numberOfVestingPeriod: 0,
                totalVestingDuration: 0,
                cliffDurationFromMigrationTime: 0,
            },
            feeSchedulerParam: {
                startingFeeBps: 5000,
                endingFeeBps: 100,
                numberOfPeriod: 120,
                totalDuration: 120,
                feeSchedulerMode: FeeSchedulerMode.Exponential,
            },
            dynamicFeeEnabled: true,
            activationType: ActivationType.Slot,
            collectFeeMode: CollectFeeMode.OnlyQuote,
            migrationFeeOption: MigrationFeeOption.FixedBps100,
            tokenType: TokenType.SPL,
            partnerLpPercentage: 0,
            creatorLpPercentage: 0,
            partnerLockedLpPercentage: 100,
            creatorLockedLpPercentage: 0,
            creatorTradingFeePercentage: 0,
            leftover: 350000000,
        })

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        console.log(
            'baseFeeParams',
            convertBNToDecimal(config.poolFees.baseFee)
        )
        console.log(
            'lockedVestingParams',
            convertBNToDecimal(config.lockedVesting)
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })
})
