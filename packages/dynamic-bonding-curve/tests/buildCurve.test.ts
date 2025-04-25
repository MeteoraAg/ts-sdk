import { expect, test, describe } from 'bun:test'
import { buildCustomConstantProductCurve } from '../src/build'
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
import { convertBNToDecimal } from '../src/utils'
import {
    getMigrationQuoteThreshold,
    getPercentageSupplyOnMigration,
} from '../src/common'

describe('buildCustomConstantProductCurve', () => {
    const baseParams = {
        totalTokenSupply: 1000000000,
        migrationOption: MigrationOption.MET_DAMM,
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
    }

    test('build curve with percentage and threshold parameters', () => {
        console.log(
            '\n testing build curve with percentage and threshold parameters...'
        )
        const config = buildCustomConstantProductCurve({
            ...baseParams,
            percentageSupplyOnMigration: 10,
            migrationQuoteThreshold: 300,
        })

        console.log('config:', convertBNToDecimal(config))
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
    })

    test('build curve with market cap parameters', () => {
        console.log('\n testing build curve with market cap parameters...')

        const percentageSupplyOnMigration = getPercentageSupplyOnMigration(
            new BN(150000),
            new BN(4900000)
        )

        const migrationQuoteThreshold = getMigrationQuoteThreshold(
            new BN(4900000),
            percentageSupplyOnMigration
        )

        console.log('percentageSupplyOnMigration:', percentageSupplyOnMigration)
        console.log('migrationQuoteThreshold:', migrationQuoteThreshold)

        const config = buildCustomConstantProductCurve({
            ...baseParams,
            initialMarketCap: 150000,
            migrationMarketCap: 4900000,
        })

        console.log('config:', convertBNToDecimal(config))
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
    })

    test('throw error when both parameter sets are provided', () => {
        console.log('\n testing error case: both parameter sets provided...')
        expect(() => {
            buildCustomConstantProductCurve({
                ...baseParams,
                percentageSupplyOnMigration: 10,
                migrationQuoteThreshold: 300,
                initialMarketCap: 15000,
                migrationMarketCap: 490000,
            })
        }).toThrow(
            'Cannot specify both (migrationQuoteThreshold && percentageSupplyOnMigration) and (initialMarketCap && migrationMarketCap)'
        )
    })

    test('throw error when no parameter sets are provided', () => {
        console.log('\n testing error case: no parameter sets provided...')
        expect(() => {
            buildCustomConstantProductCurve(baseParams)
        }).toThrow(
            'Must specify either (migrationQuoteThreshold && percentageSupplyOnMigration) or (initialMarketCap && migrationMarketCap)'
        )
    })

    test('throw error when only one parameter from a set is provided', () => {
        console.log(
            '\n testing error case: only one parameter from a set provided...'
        )
        expect(() => {
            buildCustomConstantProductCurve({
                ...baseParams,
                percentageSupplyOnMigration: 10,
            })
        }).toThrow(
            'Must specify either (migrationQuoteThreshold && percentageSupplyOnMigration) or (initialMarketCap && migrationMarketCap)'
        )
    })

    test('calculate correct percentage supply on migration from market caps', () => {
        console.log(
            '\n testing calculation of percentage supply on migration from market caps...'
        )
        const config = buildCustomConstantProductCurve({
            ...baseParams,
            initialMarketCap: 15000,
            migrationMarketCap: 490000,
        })

        console.log('config:', convertBNToDecimal(config))
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
    })
})
