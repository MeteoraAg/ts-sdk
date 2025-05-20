# Changelog

All notable changes to the Dynamic Bonding Curve SDK will be documented in this file.

## [1.1.5] - 2025-05-23

### Added

- `createConfigAndPool` function

### Changed 

- `docs.md` updated with the correct createPool format
- `CHANGELOG.md` switched to DES format

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

- fix: updated `buildCurveGraphAndCreateConfig` to use `liquidityWeights[]` instead of `kFactor`
- fix: added payer option to `claimCreatorTradingFee` and `claimPartnerTradingFee` functions
- fix: updated dynamic fee calculation to be 20% of minimum base fee
- fix: changed `createPoolAndBuy` buyer from `payer` to `poolCreator`

---

## [1.1.4] - 2025-05-09

### Release Notes

#### Feature Changes

- feat: added `buildCurveGraphAndCreateConfig` function
- feat: added `leftover` parameter to `buildCurveAndCreateConfig` and `buildCurveAndCreateConfigByMarketCap` functions

#### Breaking Changes

- `buildCurveAndCreateConfig` and `buildCurveAndCreateConfigByMarketCap` functions now require a `leftover` parameter.
- `buildCurveGraphAndCreateConfig` uses liquidityWeights[] instead of kFactor now.
- Added receiver option in `claimPartnerTradingFee` and `claimCreatorTradingFee`

## [1.1.5] - 2025-05-19

### Release Notes

#### Feature Changes

- feat: removed `buildCurveAndCreateConfig`, `buildCurveAndCreateConfigByMarketCap`, `buildCurveGraphAndCreateConfig` functions
- feat: added `buildCurveWithTwoSegments` and `buildCurveWithCreatorFirstBuy` functions
- fix: update `docs.md` with the latest changes
- feat: added `getPoolByBaseMint` function
- chore: clean up the code
- feat: added `tempWSolAcc` param to `claimCreatorTradingFee` and `claimPartnerTradingFee` functions
- feat: added `calculateInitialPriceFromSqrtStartPrice`, `calculateFeeScheduler` and `calculateLockedVesting` functions
- fix: reduced client-side filtering in `getPoolsQuoteFeesByConfig` and `getPoolsBaseFeesByConfig`
- feat: removed `getTokenDecimal` state function from client.state

#### Breaking Changes

- `buildCurveAndCreateConfig`, `buildCurveAndCreateConfigByMarketCap`, `buildCurveGraphAndCreateConfig` functions are deprecated. In order to build and create curve config, use the helper functions (`buildCurve`, `buildCurveWithMarketCap`, `buildCurveWithTwoSegments`, `buildCurveWithLiquidityWeights`, `buildCurveWithCreatorFirstBuy`) to build the curve config first before calling `createConfig`.
- `tempWSolAcc` param added to `claimCreatorTradingFee` and `claimPartnerTradingFee` functions. It is required when receiver != creator/feeClaimer.
