# Dynamic Bonding Curve SDK: Function Documentation

## Table of Contents

- [Partner Functions](#partner-functions)

    - [createConfig](#createConfig)
    - [buildAndCreateConstantProductConfig](#buildAndCreateConstantProductConfig)
    - [buildAndCreateCustomConstantProductConfig](#buildAndCreateCustomConstantProductConfig)
    - [createPartnerMetadata](#createPartnerMetadata)
    - [claimTradingFee](#claimTradingFee)
    - [partnerWithdrawSurplus](#partnerWithdrawSurplus)
    - [withdrawLeftover](#withdrawLeftover)

- [Pool Functions](#pool-functions)

    - [createPool](#createPool)
    - [createPoolMetadata](#createPoolMetadata)
    - [swap](#swap)
    - [swapQuote](#swapQuote)

- [Migration Functions](#migration-functions)

    - [createDammMigrationMetadata](#createDammMigrationMetadata)
    - [createLocker](#createLocker)
    - [migrateToDammV1](#migrateToDammV1)
    - [lockDammV1LpToken](#lockDammV1LpToken)
    - [claimDammV1LpToken](#claimDammV1LpToken)
    - [migrateToDammV2](#migrateToDammV2)

- [Helper Functions](#helper-functions)

    - [getPool](#getPool)
    - [getPools](#getPools)
    - [getPoolConfig](#getPoolConfig)
    - [getPoolMigrationQuoteThreshold](#getPoolMigrationQuoteThreshold)
    - [getPoolMetadata](#getPoolMetadata)
    - [getPartnerMetadata](#getPartnerMetadata)
    - [getDammV1MigrationMetadata](#getDammV1MigrationMetadata)
    - [getLockedLpTokenAmount](#getLockedLpTokenAmount)
    - [getCurveProgress](#getCurveProgress)
    - [getPoolAddress](#getPoolAddress)

---

## Partner Functions

### createConfig

Creates a new configuration key that will dictate the behavior of all pools created with this key.

#### Function

```typescript
async createConfig(createConfigParam: CreateConfigParam): Promise<Transaction>
```

#### Parameters

```typescript
interface CreateConfigParam {
    payer: PublicKey
    config: PublicKey
    feeClaimer: PublicKey
    leftoverReceiver: PublicKey
    quoteMint: PublicKey
    poolFees: {
        baseFee: {
            cliffFeeNumerator: BN
            numberOfPeriod: number
            reductionFactor: BN
            periodFrequency: BN
            feeSchedulerMode: number
        }
        dynamicFee: {
            binStep: number
            binStepU128: BN
            filterPeriod: number
            decayPeriod: number
            reductionFactor: number
            variableFeeControl: number
            maxVolatilityAccumulator: number
        }
    }
    activationType: number
    collectFeeMode: number
    migrationOption: number
    tokenType: number
    tokenDecimal: number
    migrationQuoteThreshold: BN
    partnerLpPercentage: number
    creatorLpPercentage: number
    partnerLockedLpPercentage: number
    creatorLockedLpPercentage: number
    sqrtStartPrice: BN
    lockedVesting: {
        amountPerPeriod: BN
        cliffDurationFromMigrationTime: BN
        frequency: BN
        numberOfPeriod: BN
        cliffUnlockAmount: BN
    }
    migrationFeeOption: number
    tokenSupply: {
        preMigrationTokenSupply: BN
        postMigrationTokenSupply: BN
    }
    padding: BN[]
    curve: {
        sqrtPrice: BN
        liquidity: BN
    }[]
}
```

#### Returns

A transaction that can be partially signed and sent to the network.

#### Example

```typescript
const transaction = await client.partners.createConfig({
    payer: wallet.publicKey,
    config: config.publicKey,
    feeClaimer: wallet.publicKey,
    leftoverReceiver: wallet.publicKey,
    quoteMint: new PublicKey('So11111111111111111111111111111111111111112'),
    poolFees: {
        baseFee: {
            cliffFeeNumerator: new BN('2500000'),
            numberOfPeriod: 0,
            reductionFactor: new BN('0'),
            periodFrequency: new BN('0'),
            feeSchedulerMode: FeeSchedulerMode.Linear,
        },
        dynamicFee: {
            binStep: 1,
            binStepU128: new BN('1844674407370955'),
            filterPeriod: 10,
            decayPeriod: 120,
            reductionFactor: 1000,
            variableFeeControl: 100000,
            maxVolatilityAccumulator: 100000,
        },
    },
    activationType: 0,
    collectFeeMode: 0,
    migrationOption: 0
    tokenType: 0,
    tokenDecimal: 9,
    migrationQuoteThreshold: new BN('1000000000'),
    partnerLpPercentage: 25,
    creatorLpPercentage: 25,
    partnerLockedLpPercentage: 25,
    creatorLockedLpPercentage: 25,
    sqrtStartPrice: new BN('58333726687135158'),
    lockedVesting: {
        amountPerPeriod: new BN('0'),
        cliffDurationFromMigrationTime: new BN('0'),
        frequency: new BN('0'),
        numberOfPeriod: new BN('0'),
        cliffUnlockAmount: new BN('0'),
    },
    migrationFeeOption: 0,
    tokenSupply: {
        preMigrationTokenSupply: new BN('10000000000000000000'),
        postMigrationTokenSupply: new BN('10000000000000000000'),
    },
    padding: [
        new BN(0),
        new BN(0),
        new BN(0),
        new BN(0),
        new BN(0),
        new BN(0),
        new BN(0),
    ],
    curve: [
        {
            sqrtPrice: new BN('233334906748540631'),
            liquidity: new BN('622226417996106429201027821619672729'),
        },
        {
            sqrtPrice: new BN('79226673521066979257578248091'),
            liquidity: new BN('1'),
        },
    ],
})
```

---

### buildAndCreateConstantProductConfig

Builds a new constant product config with majority preconfigured parameters. This creates a new configuration key that will dictate the behavior of all pools created with this key.

#### Function

```typescript
async buildAndCreateConstantProductConfig(buildAndCreateConstantProductConfigParam: BuildAndCreateConstantProductConfigParam): Promise<Transaction>
```

#### Parameters

```typescript
interface BuildAndCreateConstantProductConfigParam {
    constantProductCurveParam: {
        totalTokenSupply: number
        percentageSupplyOnMigration: number
        migrationQuoteThreshold: number
        migrationOption: number
        tokenBaseDecimal: number
        tokenQuoteDecimal: number
        lockedVesting: {
            amountPerPeriod: BN
            cliffDurationFromMigrationTime: BN
            frequency: BN
            numberOfPeriod: BN
            cliffUnlockAmount: BN
        }
    }
    feeClaimer: PublicKey
    leftoverReceiver: PublicKey
    payer: PublicKey
    quoteMint: PublicKey
    config: PublicKey
}
```

#### Returns

A transaction that can be partially signed and sent to the network.

#### Example

```typescript
const transaction = await client.partners.buildAndCreateConstantProductConfig({
    constantProductCurveParam: {
        totalTokenSupply: 1000000000,
        percentageSupplyOnMigration: 10,
        migrationQuoteThreshold: 10000000000,
        migrationOption: 0,
        tokenBaseDecimal: 9,
        tokenQuoteDecimal: 9,
        lockedVesting: {
            amountPerPeriod: new BN('0'),
            cliffDurationFromMigrationTime: new BN('0'),
            frequency: new BN('0'),
            numberOfPeriod: new BN('0'),
            cliffUnlockAmount: new BN('0'),
        },
    },
    feeClaimer: wallet.publicKey,
    leftoverReceiver: wallet.publicKey,
    payer: wallet.publicKey,
    quoteMint: new PublicKey('So11111111111111111111111111111111111111112'),
    config: config.publicKey,
})
```

---

### buildAndCreateCustomConstantProductConfig

Builds a new constant product config with customisable parameters. This creates a new configuration key that will dictate the behavior of all pools created with this key.

#### Function

```typescript
async buildAndCreateCustomConstantProductConfig(buildAndCreateCustomConstantProductConfigParam: BuildAndCreateCustomConstantProductConfigParam): Promise<Transaction>
```

#### Parameters

```typescript
interface BuildAndCreateCustomConstantProductConfigParam {
    constantProductCurveParam: {
        totalTokenSupply: number
        percentageSupplyOnMigration: number
        migrationQuoteThreshold: number
        migrationOption: number
        tokenBaseDecimal: number
        tokenQuoteDecimal: number
        lockedVesting: {
            amountPerPeriod: BN
            cliffDurationFromMigrationTime: BN
            frequency: BN
            numberOfPeriod: BN
            cliffUnlockAmount: BN
        }
    }
    feeSchedulerParam: {
        numberOfPeriod: number
        reductionFactor: number
        periodFrequency: number
        feeSchedulerMode: number
    }
    baseFeeBps: number
    dynamicFeeEnabled: boolean
    activationType: number
    collectFeeMode: number
    migrationFeeOption: number
    tokenType: number
    partnerLpPercentage: number
    creatorLpPercentage: number
    partnerLockedLpPercentage: number
    creatorLockedLpPercentage: number
    feeClaimer: PublicKey
    leftoverReceiver: PublicKey
    payer: PublicKey
    quoteMint: PublicKey
    config: PublicKey
}
```

#### Returns

A transaction that can be partially signed and sent to the network.

#### Example

```typescript
const transaction =
    await client.partners.buildAndCreateCustomConstantProductConfig({
        constantProductCurveParam: {
            totalTokenSupply: 1000000000,
            percentageSupplyOnMigration: 10,
            migrationQuoteThreshold: 10000000000,
            migrationOption: 0,
            tokenBaseDecimal: 9,
            tokenQuoteDecimal: 9,
            lockedVesting: {
                amountPerPeriod: new BN('0'),
                cliffDurationFromMigrationTime: new BN('0'),
                frequency: new BN('0'),
                numberOfPeriod: new BN('0'),
                cliffUnlockAmount: new BN('0'),
            },
        },
        feeSchedulerParam: {
            numberOfPeriod: 0,
            reductionFactor: 0,
            periodFrequency: 0,
            feeSchedulerMode: FeeSchedulerMode.Linear,
        },
        baseFeeBps: 2500000,
        dynamicFeeEnabled: false,
        activationType: 0,
        collectFeeMode: 0,
        migrationFeeOption: 0,
        tokenType: 0,
        partnerLpPercentage: 25,
        creatorLpPercentage: 25,
        partnerLockedLpPercentage: 25,
        creatorLockedLpPercentage: 25,
        feeClaimer: wallet.publicKey,
        leftoverReceiver: wallet.publicKey,
        payer: wallet.publicKey,
        quoteMint: new PublicKey('So11111111111111111111111111111111111111112'),
        config: config.publicKey,
    })
```

---

### createPartnerMetadata

Creates a new partner metadata account.

#### Function

```typescript
async createPartnerMetadata(createPartnerMetadataParam: CreatePartnerMetadataParam): Promise<Transaction>
```

#### Parameters

```typescript
interface CreatePartnerMetadataParam {
    name: string
    website: string
    logo: string
    feeClaimer: PublicKey
    payer: PublicKey
}
```

#### Returns

A transaction that can be partially signed and sent to the network.

#### Example

```typescript
const transaction = await client.partners.createPartnerMetadata({
    name: 'Jupiter',
    website: 'https://jup.ag',
    logo: 'https://jup.ag/logo.png',
    feeClaimer: wallet.publicKey,
    payer: wallet.publicKey,
})
```

---

## Pool Functions

### createPool

Creates a new pool with the configuration key.

#### Function

```typescript
async createPool(createPoolParam: CreatePoolParam): Promise<Transaction>
```

#### Parameters

```typescript
interface CreatePoolParam {
    quoteMint: PublicKey
    baseMint: PublicKey
    config: PublicKey
    baseTokenType: number
    quoteTokenType: number
    name: string
    symbol: string
    uri: string
    payer: PublicKey
    poolCreator: PublicKey
}
```

#### Returns

A transaction that requires signatures from both the creator's wallet and the baseMint keypair before being submitted to the network.

#### Example

```typescript
const transaction = await client.pools.createPool({
    quoteMint: new PublicKey('So11111111111111111111111111111111111111112'),
    baseMint: new PublicKey('JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'),
    config: config.publicKey,
    baseTokenType: 0,
    quoteTokenType: 0,
    name: 'Jupiter',
    symbol: 'JUP',
    uri: 'https://jup.ag',
    payer: wallet.publicKey,
    poolCreator: poolCreator.publicKey,
})
```

---

### swap

Swaps between base and quote or quote and base.

#### Function

```typescript
async swap(pool: PublicKey, swapParam: SwapParam): Promise<Transaction>
```

#### Parameters

```typescript
interface SwapParam {
    owner: PublicKey
    amountIn: BN
    minimumAmountOut: BN
    swapBaseForQuote: boolean
}
```

#### Returns

A transaction that can be signed and sent to the network.

#### Example

```typescript
const transaction = await client.pools.swap(poolAddress, {
    owner: wallet.publicKey,
    amountIn: new BN(1000000000),
    minimumAmountOut: new BN(0),
    swapBaseForQuote: false,
})
```

---

### swapQuote

Swaps between base and quote or quote and base.

#### Function

```typescript
swapQuote(swapQuoteParam: SwapQuoteParam): Promise<QuoteResult>
```

#### Parameters

```typescript
interface SwapQuoteParam {
    virtualPool: VirtualPool
    config: PoolConfig
    swapBaseForQuote: boolean
    amountIn: BN
    hasReferral: boolean
    currentPoint: BN
}
```

#### Returns

The quote result of the swap.

#### Example

```typescript
const quote = client.pools.swapQuote({
    virtualPool,
    swapBaseForQuote,
    amountIn,
    hasReferral,
    currentPoint,
})
```
