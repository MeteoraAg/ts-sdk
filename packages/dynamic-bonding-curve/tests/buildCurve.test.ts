import { expect, test, describe } from 'bun:test'
import {
    buildCurve,
    buildCurveWithMarketCap,
    buildCurveWithCreatorFirstBuy,
    buildCurveWithLiquidityWeights,
    buildCurveWithTwoSegments,
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
import { convertBNToDecimal } from './utils/common'
import Decimal from 'decimal.js'

describe('buildCurve tests', () => {
    const baseParams = {
        totalTokenSupply: 1000000000,
        migrationOption: MigrationOption.MET_DAMM_V2,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        lockedVesting: {
            amountPerPeriod: new BN(0),
            cliffDurationFromMigrationTime: new BN(0),
            frequency: new BN(0),
            numberOfPeriod: new BN(0),
            cliffUnlockAmount: new BN(0),
        },
        feeSchedulerParam: {
            numberOfPeriod: 0,
            reductionFactor: 0,
            periodFrequency: 0,
            feeSchedulerMode: FeeSchedulerMode.Linear,
        },
        baseFeeBps: 25,
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
            'config for curve with percentage and threshold parameters:',
            convertBNToDecimal(config)
        )
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
    })

    test('build curve by market cap', () => {
        console.log('\n testing build curve by market cap...')
        const config = buildCurveWithMarketCap({
            ...baseParams,
            initialMarketCap: 23.5,
            migrationMarketCap: 405.882352941,
        })

        console.log(
            'config for curve by market cap:',
            convertBNToDecimal(config)
        )
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
    })

    test('build curve by market cap with locked vesting', () => {
        console.log('\n testing build curve with locked vesting...')
        const lockedVestingParams = {
            ...baseParams,
            initialMarketCap: 99.1669972233,
            migrationMarketCap: 462.779320376,
            lockedVesting: {
                amountPerPeriod: new BN(1000000),
                cliffDurationFromMigrationTime: new BN(0),
                frequency: new BN(30 * 24 * 60 * 60),
                numberOfPeriod: new BN(12),
                cliffUnlockAmount: new BN(5000000),
            },
        }

        const config = buildCurveWithMarketCap(lockedVestingParams)

        console.log('config with locked vesting:', convertBNToDecimal(config))
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)

        const totalVestingAmount =
            lockedVestingParams.lockedVesting.cliffUnlockAmount.add(
                lockedVestingParams.lockedVesting.amountPerPeriod.mul(
                    lockedVestingParams.lockedVesting.numberOfPeriod
                )
            )
        const vestingPercentage = totalVestingAmount
            .mul(new BN(100))
            .div(new BN(lockedVestingParams.totalTokenSupply))
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
            'config for curve with liquidity weights 1.2^n:',
            convertBNToDecimal(config)
        )
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
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
            'config for curve with liquidity weights 0.6^n:',
            convertBNToDecimal(config)
        )
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
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
            lockedVesting: {
                amountPerPeriod: new BN(1),
                cliffDurationFromMigrationTime: new BN(1),
                frequency: new BN(1),
                numberOfPeriod: new BN(1),
                cliffUnlockAmount: new BN(10_000_000 * 10 ** TokenDecimal.SIX), // 10M for creator
            },
            leftover: 200000000,
            liquidityWeights,
            migrationOption: MigrationOption.MET_DAMM,
        }

        const config = buildCurveWithLiquidityWeights(curveGraphParams)

        console.log(
            'config for curve with liquidity weights v1:',
            convertBNToDecimal(config)
        )
        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.SIX))
                .toString()
        )
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
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
            'config for curve with liquidity weights v2:',
            convertBNToDecimal(config)
        )
        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.SIX))
                .toString()
        )
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
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
            'config for curve with creator first buy:',
            convertBNToDecimal(config)
        )
        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
    })

    test('build two segment curve with market cap', () => {
        console.log('\n testing build two segment curve with market cap...')

        const curveGraphParams = {
            ...baseParams,
            totalTokenSupply: 1000000000,
            initialMarketCap: 20,
            migrationMarketCap: 320,
            percentageSupplyOnMigration: 20,
            tokenBaseDecimal: TokenDecimal.SIX,
            tokenQuoteDecimal: TokenDecimal.NINE,
            leftover: 350000000,
            migrationOption: MigrationOption.MET_DAMM_V2,
            lockedVesting: {
                amountPerPeriod: new BN(0),
                cliffDurationFromMigrationTime: new BN(0),
                frequency: new BN(0),
                numberOfPeriod: new BN(0),
                cliffUnlockAmount: new BN(0),
            },
        }

        const config = buildCurveWithTwoSegments(curveGraphParams)

        console.log(
            'config for curve with creator first buy:',
            convertBNToDecimal(config)
        )
        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
    })
})
