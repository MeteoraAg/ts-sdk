# Changelog

All notable changes to the Dynamic Bonding Curve SDK will be documented in this file.

## [1.1.5] - 2025-05-19

### Added

- New curve building functions:
    - `buildCurveWithTwoSegments`
    - `buildCurveWithCreatorFirstBuy`
- New utility functions:
    - `getPoolByBaseMint`
    - `calculateInitialPriceFromSqrtStartPrice`
    - `calculateFeeScheduler`
    - `calculateLockedVesting`

### Changed

- Updated documentation in `docs.md`
- Optimized client-side filtering in `getPoolsQuoteFeesByConfig` and `getPoolsBaseFeesByConfig`

### Removed

- Deprecated curve building functions:
    - `buildCurveAndCreateConfig`
    - `buildCurveAndCreateConfigByMarketCap`
    - `buildCurveGraphAndCreateConfig`
- Removed `getTokenDecimal` state function from client.state

### Breaking Changes

- Curve building functions are now split into two steps:
    1. Use helper functions to build curve config:
        - `buildCurve`
        - `buildCurveWithMarketCap`
        - `buildCurveWithTwoSegments`
        - `buildCurveWithLiquidityWeights`
        - `buildCurveWithCreatorFirstBuy`
    2. Call `createConfig` with the built config
- Added required `tempWSolAcc` parameter to fee claiming functions when receiver differs from creator/feeClaimer

## [1.1.4] - 2025-05-09

### Added

- New function: `buildCurveGraphAndCreateConfig`
- Added `leftover` parameter to curve building functions

### Changed

- Updated fee claiming functions to support custom receivers

### Breaking Changes

- `buildCurveAndCreateConfig` and `buildCurveAndCreateConfigByMarketCap` now require `leftover` parameter
- `buildCurveGraphAndCreateConfig` uses `liquidityWeights[]` instead of `kFactor`
- Added receiver option in `claimPartnerTradingFee` and `claimCreatorTradingFee`

## [1.1.3] - 2025-05-07

### Changed

- Updated `buildCurveGraphAndCreateConfig` to use `liquidityWeights[]` instead of `kFactor`
- Modified dynamic fee calculation to be 20% of minimum base fee
- Changed `createPoolAndBuy` buyer from `payer` to `poolCreator`

### Added

- Payer option to `claimCreatorTradingFee` and `claimPartnerTradingFee` functions

## [1.1.2] - 2025-04-30

### Added

- New fee options: 4% and 6% graduation fees
- New functions:
    - `creatorWithdrawSurplus`
    - `claimCreatorTradingFee`
    - `createPoolAndBuy`
- New getter functions
- SDK modularization and RPC call optimization

### Changed

- Updated service and getter function calling patterns

### Breaking Changes

- Added required `creatorTradingFeePercentage` parameter to:
    - `createConfig`
    - `buildCurveAndCreateConfig`
    - `buildCurveAndCreateConfigByMarketCap`
- Updated function namespaces:
    - `client.partners` → `client.partner`
    - `client.migrations` → `client.migration`
    - `client.creators` → `client.creator`
    - `client.pools` → `client.pool`
    - `client.getProgram()` → `client.state`
- New pool address derivation functions:
    1. `deriveDbcPoolAddress`
    2. `deriveDammV1PoolAddress`
    3. `deriveDammV2PoolAddress`
